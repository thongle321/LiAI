"""Vision socket route: framing and dispatch live in realtime/ws.py."""

from fastapi import APIRouter, WebSocket

from ..realtime.ws import handle_vision_socket

router = APIRouter()


@router.websocket("/api/vision/ws")
async def vision_ws(websocket: WebSocket) -> None:
    await handle_vision_socket(websocket)
