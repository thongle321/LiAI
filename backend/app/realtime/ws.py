"""Vision socket loop: framing and dispatch (main.py only routes)."""

import asyncio
import base64
import dataclasses
import difflib
import math
import os

from fastapi import WebSocket, WebSocketDisconnect
from pydantic import TypeAdapter

from ..schemas.vision import VisionClientMessage
from .qa import answer_about_frame, caption_frame, store_caption, validate_jpeg

_adapter = TypeAdapter(VisionClientMessage)

# Q4: self-pacing loop — throughput is inference-bound, this is only the
# gap between tick starts (anti-hot-loop on instant skips/failures).
DEFAULT_NARRATION_GAP = 0.5
MIN_NARRATION_GAP = 0.1
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


def narration_gap() -> float:
    """Per-socket minimum gap between narration ticks: env-tunable."""
    try:
        seconds = float(os.getenv("VISION_NARRATION_GAP_SECONDS", ""))
    except ValueError:
        return DEFAULT_NARRATION_GAP
    if not math.isfinite(seconds) or seconds < MIN_NARRATION_GAP:
        return DEFAULT_NARRATION_GAP
    return seconds


async def send_error(websocket: WebSocket, message: str) -> None:
    await websocket.send_json(
        {"type": "error", "error": {"code": "invalid_request", "message": message}}
    )


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
        return
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
        try:
            if not is_duplicate(caption, state.last_caption):
                state.session_id = store_caption(caption, state.session_id)
            state.last_caption = caption
            await websocket.send_json(
                {"type": "caption", "text": caption, "session_id": state.session_id}
            )
        except Exception:
            return
        finally:
            state.narration = None


async def narration_loop(
    websocket: WebSocket,
    lock: asyncio.Lock,
    state: SocketState,
    gap: float,
) -> None:
    while True:
        await asyncio.sleep(gap)
        await narration_tick(websocket, lock, state)


async def handle_vision_socket(websocket: WebSocket) -> None:
    await websocket.accept()
    # ponytail: session minted lazily on first stored turn (answer or caption)
    state = SocketState()
    lock = asyncio.Lock()
    task = asyncio.create_task(
        narration_loop(websocket, lock, state, narration_gap())
    )
    try:
        while True:
            try:
                raw_msg = await websocket.receive_json()
            except WebSocketDisconnect:
                return
            except Exception:
                await send_error(websocket, "malformed message")
                continue
            try:
                msg = _adapter.validate_python(raw_msg)
            except Exception:
                await send_error(websocket, "unknown type")
                continue
            if msg.type == "frame":
                try:
                    raw = base64.b64decode(msg.jpeg, validate=True)
                    validate_jpeg(raw)
                except ValueError:
                    await send_error(websocket, "bad frame")
                    continue
                state.latest = raw
            else:
                if not msg.text.strip():
                    await send_error(websocket, "empty question")
                    continue
                if state.latest is None:
                    await send_error(websocket, "no frame yet")
                    continue
                await cancel_narration(state)
                async with lock:
                    try:
                        reply, state.session_id = await answer_about_frame(
                            msg.text, state.latest, state.session_id
                        )
                    except ValueError as exc:
                        await send_error(websocket, str(exc))
                        continue
                    except Exception as exc:
                        await websocket.send_json(
                            {
                                "type": "error",
                                "error": {"code": "llm_error", "message": str(exc)},
                            }
                        )
                        continue
                await websocket.send_json(
                    {"type": "answer", "text": reply, "session_id": state.session_id}
                )
    finally:
        state.closed = True
        await cancel_narration(state)
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
