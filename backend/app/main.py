import base64
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logging.getLogger("app").setLevel(logging.INFO)

from fastapi import FastAPI, Request, WebSocket
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic_ai.exceptions import UserError
from starlette.exceptions import HTTPException as StarletteHTTPException

from .agents import companion, get_companion_agent
from .agents.companion import assistant_text, persist_turn, to_message_history
from .memory import Turn, get_store
from .providers.factory import get_provider
from .realtime import vlm
from .realtime.qa import validate_jpeg
from .realtime.ws import handle_vision_socket
from .schemas import (
    ChatRequest,
    ChatResponse,
    ErrorDetail,
    ErrorResponse,
    HealthResponse,
    HistoryMessage,
    HistoryResponse,
)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    provider = get_provider()
    model = getattr(provider, "model_name", None)
    logging.getLogger(__name__).info(
        "llm provider=%s%s",
        type(provider).__name__,
        f" model={model}" if model else "",
    )
    # Fail fast: no keyless boot. The SDK validates the key eagerly at
    # build, so a truly missing key crashes startup with an actionable
    # hint instead of failing every turn. Tests patch the route
    # call-site (app.main.get_companion_agent), never this
    # source-namespace build.
    try:
        companion.get_companion_agent(provider)
    except UserError as exc:
        logging.getLogger(__name__).error(
            "llm backend misconfigured: %s "
            "Set OPENROUTER_API_KEY in backend/.env "
            "(see backend/.env.example) or export it, then restart.",
            exc,
        )
        raise
    vlm.warmup()
    yield


app = FastAPI(title="LiAI backend", lifespan=lifespan)

# ponytail: open CORS for dev only, restrict origins when auth/prod lands
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse()


def _error(status_code: int, code: str, message: str) -> JSONResponse:
    # One envelope for every failure, built from the shared schema.
    body = ErrorResponse(error=ErrorDetail(code=code, message=message))
    return JSONResponse(status_code=status_code, content=body.model_dump())


# ponytail: one envelope for every failure so the Expo client parses once
@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    message = "; ".join(e["msg"] for e in exc.errors())
    return _error(422, "invalid_request", message)


@app.exception_handler(StarletteHTTPException)
async def http_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    code = "not_found" if exc.status_code == 404 else "http_error"
    return _error(exc.status_code, code, str(exc.detail))


@app.exception_handler(Exception)
async def unhandled_handler(request: Request, exc: Exception) -> JSONResponse:
    return _error(500, "internal_error", str(exc))


@app.get("/api/history", response_model=HistoryResponse)
async def history(session_id: str | None = None) -> HistoryResponse | JSONResponse:
    store = get_store()
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
    except Exception as exc:
        return _error(503, "store_error", str(exc))


def _decode_image(data_uri: str) -> bytes:
    """Bare base64 payload or data-uri; anything else raises ValueError."""
    try:
        return base64.b64decode(data_uri.split(",", 1)[-1], validate=True)
    except ValueError:
        raise ValueError("image must be base64-encoded JPEG") from None


@app.websocket("/api/vision/ws")
async def vision_ws(websocket: WebSocket) -> None:
    await handle_vision_socket(websocket)


@app.post("/api/chat", response_model=ChatResponse)
async def chat(body: ChatRequest) -> ChatResponse | JSONResponse:
    store = get_store()
    session_id = body.session_id
    try:
        if session_id is None or store.get(session_id) is None:
            session_id = store.create()
            history: list[Turn] = []
        else:
            history = store.get(session_id) or []
    except Exception as exc:
        return _error(503, "store_error", str(exc))
    if body.image is not None:
        try:
            image_bytes = _decode_image(body.image)
            validate_jpeg(image_bytes)
            reply = await vlm.describe_frame(image_bytes, body.message)
        except ValueError as exc:
            return _error(400, "invalid_request", str(exc))
        except Exception as exc:  # noqa: BLE001 — same boundary as the text path below
            return _error(502, "llm_error", str(exc))
    else:
        try:
            result = await get_companion_agent().run(
                body.message, message_history=to_message_history(history)
            )
        except Exception as exc:
            return _error(502, "llm_error", str(exc))
        reply = assistant_text(result.output)
    try:
        session_id = persist_turn(store, session_id, body.message, reply)
    except Exception as exc:
        return _error(503, "store_error", str(exc))
    return ChatResponse(reply=reply, session_id=session_id)
