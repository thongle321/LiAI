"""Chat + history routes: parse → turn seam → map response."""

import asyncio
import base64

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic_ai import Agent

from ...providers import ChatProvider
from ...providers.factory import ByokContext, UnknownModelError, resolve
from ...shared.kernel import error_response
from ...shared.ports import ConversationStore, SessionInfo, Turn
from ...shared.validators import validate_jpeg
from ..companion import (
    NothingToRegenerate,
    SearchContext,
    StoreError,
    StreamStart,
    agent_dependency,
    get_store,
    prepare_stream_turn,
    run_turn,
    stream_turn_events,
)
from .internal.sse import event_to_sse, format_event
from .schemas import (
    ChatRequest,
    ChatResponse,
    HistoryMessage,
    HistoryResponse,
    SessionInfoResponse,
    SessionListResponse,
    SessionUpdateRequest,
)

router = APIRouter()


def _to_info(info: SessionInfo) -> SessionInfoResponse:
    return SessionInfoResponse(
        id=info.id, title=info.title, pinned=info.pinned, updated_at=info.updated_at
    )


def _find_session(
    store: ConversationStore, session_id: str
) -> SessionInfoResponse | None:
    for info in store.list_sessions():
        if info.id == session_id:
            return _to_info(info)
    return None


@router.get("/api/sessions", response_model=SessionListResponse)
async def list_sessions(
    store: ConversationStore = Depends(get_store),  # noqa: B008 — resolved by FastAPI
) -> SessionListResponse | JSONResponse:
    try:
        infos = store.list_sessions()
    except Exception as exc:  # noqa: BLE001 — store boundary maps to 503 envelope
        return error_response(503, "store_error", str(exc))
    return SessionListResponse(sessions=[_to_info(i) for i in infos])


@router.post("/api/sessions", response_model=SessionInfoResponse, status_code=201)
async def create_session(
    store: ConversationStore = Depends(get_store),  # noqa: B008 — resolved by FastAPI
) -> SessionInfoResponse | JSONResponse:
    try:
        session_id = store.create()
        info = _find_session(store, session_id)
    except Exception as exc:  # noqa: BLE001 — store boundary maps to 503 envelope
        return error_response(503, "store_error", str(exc))
    if info is None:
        return error_response(500, "internal_error", "session vanished after create")
    return info


@router.patch("/api/sessions/{session_id}", response_model=SessionInfoResponse)
async def update_session(
    session_id: str,
    body: SessionUpdateRequest,
    store: ConversationStore = Depends(get_store),  # noqa: B008 — resolved by FastAPI
) -> SessionInfoResponse | JSONResponse:
    try:
        if body.title is not None and not store.rename_session(session_id, body.title):
            return error_response(404, "not_found", "session not found")
        if body.pinned is not None and not store.set_session_pinned(
            session_id, body.pinned
        ):
            return error_response(404, "not_found", "session not found")
        info = _find_session(store, session_id)
    except Exception as exc:  # noqa: BLE001 — store boundary maps to 503 envelope
        return error_response(503, "store_error", str(exc))
    if info is None:
        return error_response(404, "not_found", "session not found")
    return info


@router.delete("/api/sessions/{session_id}")
async def delete_session(
    session_id: str,
    store: ConversationStore = Depends(get_store),  # noqa: B008 — resolved by FastAPI
) -> JSONResponse:
    try:
        deleted = store.delete_session(session_id)
    except Exception as exc:  # noqa: BLE001 — store boundary maps to 503 envelope
        return error_response(503, "store_error", str(exc))
    if not deleted:
        return error_response(404, "not_found", "session not found")
    return JSONResponse(content={"message": "deleted"})


@router.get(
    "/api/history",
    response_model=HistoryResponse,
    response_model_exclude_none=True,
)
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
                HistoryMessage(role=t.role, content=t.content, metadata=t.metadata)
                for t in turns
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
) -> ChatResponse | StreamingResponse | JSONResponse:
    image_bytes: bytes | None = None
    if body.image is not None:
        try:
            image_bytes = _decode_image(body.image)
            validate_jpeg(image_bytes)
        except ValueError as exc:
            return error_response(400, "invalid_request", str(exc))
    try:
        provider = _resolve_provider(body)
    except UnknownModelError as exc:
        return error_response(400, "invalid_request", str(exc))
    # A selected model builds its agent from the resolved provider in the
    # service; the Depends agent always carries the default provider, so
    # passing it would silently ignore the selection.
    turn_agent = None if body.model_id is not None else agent
    if not body.stream:
        try:
            outcome = await run_turn(
                store,
                body.session_id,
                body.message or "",
                image=image_bytes,
                agent=turn_agent,
                search=_search_context(body),
                provider=provider,
            )
        except StoreError as exc:
            return error_response(503, "store_error", str(exc))
        except Exception as exc:  # noqa: BLE001 — llm/agent boundary
            return error_response(502, "llm_error", str(exc))
        return ChatResponse(reply=outcome.reply, session_id=outcome.session_id)
    try:
        sid, text, history = await prepare_stream_turn(
            store, body.session_id, body.message, retry=body.retry
        )
    except NothingToRegenerate as exc:
        return error_response(400, "invalid_request", str(exc))
    except StoreError as exc:
        return error_response(503, "store_error", str(exc))
    return StreamingResponse(
        _stream_events(
            store,
            sid,
            text,
            history,
            image_bytes,
            turn_agent,
            _search_context(body),
            provider,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def _search_context(body: ChatRequest) -> SearchContext | None:
    """Wire creds -> talent context (transient; never stored or logged)."""
    if body.search is None:
        return None
    return SearchContext(
        provider=body.search.provider,
        key=body.search.key.strip(),
        count=body.search.count,
    )


def _byok_context(body: ChatRequest) -> ByokContext | None:
    """Wire creds -> provider context (transient; never stored or logged)."""
    if body.byok is None:
        return None
    return ByokContext(
        provider=body.byok.provider,
        base_url=body.byok.base_url.strip(),
        api_key=body.byok.api_key.strip(),
        model=body.byok.model.strip(),
    )


def _resolve_provider(body: ChatRequest) -> ChatProvider:
    """Select the turn's runtime (ADR-006); unknown ids are client bugs."""
    return resolve(body.model_id, _byok_context(body))


async def _stream_events(
    store: ConversationStore,
    session_id: str,
    text: str,
    history: list[Turn],
    image: bytes | None,
    agent: Agent[None, str],
    search: SearchContext | None,
    provider: ChatProvider | None,
):
    """SSE body: start first, then companion events; failures become error events.

    The status line is already sent, so mid-stream failures cannot become
    JSON statuses. Client disconnects re-raise (never converted to events).
    """
    yield event_to_sse(StreamStart(session_id))
    try:
        async for event in stream_turn_events(
            store,
            session_id,
            text,
            history,
            image=image,
            agent=agent,
            search=search,
            provider=provider,
        ):
            yield event_to_sse(event)
    except asyncio.CancelledError:
        raise
    except StoreError as exc:
        yield format_event("error", {"code": "store_error", "message": str(exc)})
    except Exception as exc:  # noqa: BLE001 — llm/agent boundary, streamed as event
        yield format_event("error", {"code": "llm_error", "message": str(exc)})
