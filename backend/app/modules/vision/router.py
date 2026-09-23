"""Vision socket route: thin wiring; framing lives in internal/ws.py."""

from fastapi import APIRouter, Depends, WebSocket
from pydantic_ai import Agent

from ...shared.ports import ConversationStore
from ..companion import agent_dependency, get_store
from .internal.ws import handle_vision_socket

router = APIRouter()


@router.websocket("/api/vision/ws")
async def vision_ws(
    websocket: WebSocket,
    agent: Agent[None, str] = Depends(agent_dependency),  # noqa: B008 — resolved by FastAPI
    store: ConversationStore = Depends(get_store),  # noqa: B008 — resolved by FastAPI
) -> None:
    await handle_vision_socket(websocket, agent=agent, store=store)
