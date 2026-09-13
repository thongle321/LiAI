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
from starlette.exceptions import HTTPException as StarletteHTTPException

from .agents import get_companion_agent
from .agents.companion import to_message_history
from .memory import Turn, get_store
from .realtime import vlm
from .realtime.ws import handle_vision_socket
from .schemas import (
    ChatRequest,
    ChatResponse,
    HealthResponse,
    HistoryMessage,
    HistoryResponse,
)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
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
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message}},
    )


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
    try:
        result = await get_companion_agent().run(
            body.message, message_history=to_message_history(history)
        )
    except Exception as exc:
        return _error(502, "llm_error", str(exc))
    reply = str(result.output)
    try:
        store.append(session_id, Turn(role="user", content=body.message))
        store.append(session_id, Turn(role="assistant", content=reply))
    except Exception as exc:
        return _error(503, "store_error", str(exc))
    return ChatResponse(reply=reply, session_id=session_id)
