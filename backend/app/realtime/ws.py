"""Vision socket loop: framing and dispatch (main.py only routes)."""

import asyncio
import base64
import dataclasses
import math
import os

from fastapi import WebSocket, WebSocketDisconnect
from pydantic import TypeAdapter

from ..schemas.vision import VisionClientMessage
from .qa import answer_about_frame, narrate_frame, validate_jpeg

_adapter = TypeAdapter(VisionClientMessage)

DEFAULT_NARRATION_INTERVAL = 5.0
MIN_NARRATION_INTERVAL = 1.0


@dataclasses.dataclass
class SocketState:
    latest: bytes | None = None
    session_id: str | None = None


def narration_interval() -> float:
    """Per-socket tick seconds: env-tunable, sane on garbage (Q4)."""
    try:
        seconds = float(os.getenv("VISION_NARRATION_INTERVAL_SECONDS", ""))
    except ValueError:
        return DEFAULT_NARRATION_INTERVAL
    if not math.isfinite(seconds) or seconds < MIN_NARRATION_INTERVAL:
        return DEFAULT_NARRATION_INTERVAL
    return seconds


async def send_error(websocket: WebSocket, message: str) -> None:
    await websocket.send_json(
        {"type": "error", "error": {"code": "invalid_request", "message": message}}
    )


async def narration_tick(
    websocket: WebSocket, lock: asyncio.Lock, state: SocketState
) -> None:
    """One tick: caption the latest frame unless busy or empty.

    Skips silently on no frame, a held lock (Q3), or VLM failure —
    the socket stays clean for answers.
    """
    if state.latest is None or lock.locked():
        return
    async with lock:
        try:
            caption, state.session_id = await narrate_frame(
                state.latest, state.session_id
            )
            await websocket.send_json(
                {"type": "caption", "text": caption, "session_id": state.session_id}
            )
        except Exception:
            return


async def narration_loop(
    websocket: WebSocket,
    lock: asyncio.Lock,
    state: SocketState,
    interval: float,
) -> None:
    while True:
        await asyncio.sleep(interval)
        await narration_tick(websocket, lock, state)


async def handle_vision_socket(websocket: WebSocket) -> None:
    await websocket.accept()
    # ponytail: session minted lazily on first stored turn (answer or caption)
    state = SocketState()
    lock = asyncio.Lock()
    task = asyncio.create_task(
        narration_loop(websocket, lock, state, narration_interval())
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
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
