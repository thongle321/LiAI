"""Vision socket loop: framing and dispatch (main.py only routes)."""

import base64

from fastapi import WebSocket, WebSocketDisconnect
from pydantic import TypeAdapter

from ..memory import get_store
from ..schemas.vision import VisionClientMessage
from .qa import answer_about_frame, validate_jpeg

_adapter = TypeAdapter(VisionClientMessage)


async def send_error(websocket: WebSocket, message: str) -> None:
    await websocket.send_json(
        {"type": "error", "error": {"code": "invalid_request", "message": message}}
    )


async def handle_vision_socket(websocket: WebSocket) -> None:
    await websocket.accept()
    # ponytail: session minted lazily on first answered question
    session_id: str | None = None
    latest: bytes | None = None
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
            latest = raw
        else:
            if not msg.text.strip():
                await send_error(websocket, "empty question")
                continue
            if latest is None:
                await send_error(websocket, "no frame yet")
                continue
            try:
                reply, session_id = await answer_about_frame(
                    msg.text, latest, session_id
                )
            except ValueError as exc:
                await send_error(websocket, str(exc))
                continue
            except Exception as exc:
                await websocket.send_json(
                    {"type": "error", "error": {"code": "llm_error", "message": str(exc)}}
                )
                continue
            await websocket.send_json(
                {"type": "answer", "text": reply, "session_id": session_id}
            )
