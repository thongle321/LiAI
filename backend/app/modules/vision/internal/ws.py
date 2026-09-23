"""Vision socket loop: framing and dispatch (main.py only routes)."""

import asyncio
import base64
import dataclasses
import difflib
import logging

from fastapi import WebSocket, WebSocketDisconnect
from pydantic import TypeAdapter
from pydantic_ai import Agent

from ....schemas import ErrorDetail
from ..schemas import VisionClientMessage
from .qa import answer_about_frame, caption_frame, store_caption, validate_jpeg

_adapter = TypeAdapter(VisionClientMessage)

logger = logging.getLogger(__name__)

# Q4: self-pacing loop — throughput is inference-bound, this is only the
# gap between tick starts (anti-hot-loop on instant skips/failures).
# Fixed constant by decision: env is for secrets/URLs, not tunables.
NARRATION_GAP = 0.5
# Q5: near-identical captions still go to the client, but only novel
# ones cost a Turn in history.
DEDUP_RATIO = 0.9


@dataclasses.dataclass
class SocketState:
    latest: bytes | None = None
    session_id: str | None = None
    narration: asyncio.Task[str] | None = None
    last_caption: str = ""
    closed: bool = False
    no_frame_logged: bool = False


async def send_json(websocket: WebSocket, payload: dict) -> bool:
    """Send, treating a closing socket as clean exit (not a crash).

    Exiting the Vision tab races in-flight frames against the closing
    handshake; a send that lands mid-close raises WebSocketDisconnect.
    """
    try:
        await websocket.send_json(payload)
    except (WebSocketDisconnect, RuntimeError):
        return False
    return True


async def send_error(websocket: WebSocket, message: str) -> bool:
    return await send_json(websocket, _error_payload("invalid_request", message))


def _error_payload(code: str, message: str) -> dict:
    # Same envelope as the HTTP routes, plus the socket's type tag.
    detail = ErrorDetail(code=code, message=message)
    return {"type": "error", "error": detail.model_dump()}


def is_duplicate(caption: str, previous: str) -> bool:
    return bool(previous) and (
        difflib.SequenceMatcher(None, previous, caption).ratio() >= DEDUP_RATIO
    )


async def cancel_narration(state: SocketState) -> None:
    """Q6: a user question outranks background narration — drop the
    in-flight caption (if any) before answering."""
    task = state.narration
    state.narration = None
    if task is not None and not task.done():
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


async def narration_tick(
    websocket: WebSocket, lock: asyncio.Lock, state: SocketState
) -> None:
    """One tick: caption the latest frame unless busy or empty.

    Skips silently on no frame, a held lock, an in-flight caption, or
    VLM failure — the socket stays clean for answers.
    """
    if (
        state.latest is None
        or lock.locked()
        or (state.narration is not None and not state.narration.done())
    ):
        if state.latest is None and not state.no_frame_logged:
            state.no_frame_logged = True
            logger.warning("narration tick: no frame received yet")
        return
    state.no_frame_logged = False
    async with lock:
        task = state.narration = asyncio.create_task(caption_frame(state.latest))
        try:
            caption = await task
        except asyncio.CancelledError:
            # Preempted by a question (cancel_narration nulled the slot)
            # → tick ends, loop resumes. Disconnect (slot intact or
            # handler closed) → re-raise so the loop dies with the socket.
            if state.narration is not None and not state.closed:
                raise
            return
        except Exception:
            logger.warning("narration caption failed", exc_info=True)
            return
        finally:
            state.narration = None
        try:
            if not is_duplicate(caption, state.last_caption):
                state.session_id = store_caption(caption, state.session_id)
            state.last_caption = caption
            logger.info('content = "%s"', caption)
            await websocket.send_json(
                {"type": "caption", "text": caption, "session_id": state.session_id}
            )
        except Exception:
            logger.warning("narration caption send failed", exc_info=True)
            return


async def narration_loop(
    websocket: WebSocket,
    lock: asyncio.Lock,
    state: SocketState,
    gap: float,
) -> None:
    while True:
        await asyncio.sleep(gap)
        await narration_tick(websocket, lock, state)


async def handle_vision_socket(
    websocket: WebSocket, agent: Agent[None, str] | None = None
) -> None:
    await websocket.accept()
    # ponytail: session minted lazily on first stored turn (answer or caption)
    state = SocketState()
    lock = asyncio.Lock()
    task = asyncio.create_task(narration_loop(websocket, lock, state, NARRATION_GAP))
    try:
        while True:
            try:
                raw_msg = await websocket.receive_json()
            except WebSocketDisconnect as exc:
                logger.info("vision socket disconnected code=%s", exc.code)
                return
            except Exception:
                if not await send_error(websocket, "malformed message"):
                    return
                continue
            try:
                msg = _adapter.validate_python(raw_msg)
            except Exception:
                if not await send_error(websocket, "unknown type"):
                    return
                continue
            if msg.type == "frame":
                try:
                    raw = base64.b64decode(msg.jpeg, validate=True)
                    validate_jpeg(raw)
                except ValueError:
                    if not await send_error(websocket, "bad frame"): return
                    continue
                state.latest = raw
            else:
                if not msg.text.strip():
                    if not await send_error(websocket, "empty question"):
                        return
                    continue
                if state.latest is None:
                    if not await send_error(websocket, "no frame yet"):
                        return
                    continue
                await cancel_narration(state)
                async with lock:
                    try:
                        reply, state.session_id = await answer_about_frame(
                            msg.text, state.latest, state.session_id, agent=agent
                        )
                    except ValueError as exc:
                        if not await send_error(websocket, str(exc)):
                            return
                        continue
                    except Exception as exc:
                        if not await send_json(
                            websocket, _error_payload("llm_error", str(exc))
                        ):
                            return
                        continue
                if not await send_json(
                    websocket,
                    {"type": "answer", "text": reply, "session_id": state.session_id},
                ):
                    return
    finally:
        state.closed = True
        await cancel_narration(state)
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
