"""Vision socket route: framing and dispatch live in realtime/ws.py."""

from fastapi import APIRouter, Depends, WebSocket
from pydantic_ai import Agent

from ..modules.companion import agent_dependency
from ..realtime.ws import handle_vision_socket

router = APIRouter()


@router.websocket("/api/vision/ws")
async def vision_ws(
    websocket: WebSocket,
    agent: Agent[None, str] = Depends(agent_dependency),  # noqa: B008 — resolved by FastAPI
) -> None:
    await handle_vision_socket(websocket, agent=agent)
