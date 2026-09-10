from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .agents import get_companion_agent
from .agents.companion import to_message_history
from .memory import Turn, get_store
from .schemas import ChatRequest, ChatResponse, HealthResponse

app = FastAPI(title="LiAI backend")

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
