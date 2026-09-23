"""Chat + history routes: parse → turn seam → map response."""

import base64

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic_ai import Agent

from ..modules.companion import (
    StoreError,
    agent_dependency,
    get_store,
    run_turn,
)
from ..realtime.qa import validate_jpeg
from ..schemas import (
    ChatRequest,
    ChatResponse,
    HistoryMessage,
    HistoryResponse,
)
from ..shared.kernel import error_response
from ..shared.ports import ConversationStore

router = APIRouter()


@router.get("/api/history", response_model=HistoryResponse)
async def history(
    session_id: str | None = None,
    store: ConversationStore = Depends(get_store),  # noqa: B008 — resolved by FastAPI
) -> HistoryResponse | JSONResponse:
    try:
        if session_id is None:
            return HistoryResponse(session_id=store.create(), messages=[])
        turns = store.get(session_id)
        if turns is None:
            return HistoryResponse(session_id=store.create(), messages=[])
        return HistoryResponse(
            session_id=session_id,
            messages=[
                HistoryMessage(role=t.role, content=t.content) for t in turns
            ],
        )
    except Exception as exc:  # noqa: BLE001 — store boundary maps to 503 envelope
        return error_response(503, "store_error", str(exc))


def _decode_image(data_uri: str) -> bytes:
    """Bare base64 payload or data-uri; anything else raises ValueError."""
    try:
        return base64.b64decode(data_uri.split(",", 1)[-1], validate=True)
    except ValueError:
        raise ValueError("image must be base64-encoded JPEG") from None


@router.post("/api/chat", response_model=ChatResponse)
async def chat(
    body: ChatRequest,
    store: ConversationStore = Depends(get_store),  # noqa: B008 — resolved by FastAPI
    agent: Agent[None, str] = Depends(agent_dependency),  # noqa: B008 — resolved by FastAPI
) -> ChatResponse | JSONResponse:
    image_bytes: bytes | None = None
    if body.image is not None:
        try:
            image_bytes = _decode_image(body.image)
            validate_jpeg(image_bytes)
        except ValueError as exc:
            return error_response(400, "invalid_request", str(exc))
    try:
        outcome = await run_turn(
            store, body.session_id, body.message, image=image_bytes, agent=agent
        )
    except StoreError as exc:
        return error_response(503, "store_error", str(exc))
    except Exception as exc:  # noqa: BLE001 — llm/agent boundary
        return error_response(502, "llm_error", str(exc))
    return ChatResponse(reply=outcome.reply, session_id=outcome.session_id)
