"""LiAI backend composition root (ADR-0002): lifespan, middleware, router mounts.

Route logic lives in app/routers/*; this file only ties everything together.
"""

import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from pydantic_ai.exceptions import UserError
from starlette.exceptions import HTTPException as StarletteHTTPException

from .modules import companion
from .modules.models import router as models_router
from .providers.factory import clear_provider_cache, get_provider
from .realtime import vlm
from .routers import chat, vision
from .schemas import HealthResponse
from .shared.kernel import error_response

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logging.getLogger("app").setLevel(logging.INFO)


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
    # hint instead of failing every turn. Tests patch the single seam
    # (app.agents.companion.get_companion_agent), never this
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
    # Cleanup on shutdown
    clear_provider_cache()


app = FastAPI(title="LiAI backend", lifespan=lifespan)

# ponytail: open CORS for dev only. Prod sets CORS_ORIGINS to explicit origins
# (credentialed mobile/web clients); the "*" default never leaves dev.
_cors_origins = [
    o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse()


# ponytail: one envelope for every failure so the Expo client parses once
@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    message = "; ".join(e["msg"] for e in exc.errors())
    return error_response(422, "invalid_request", message)


@app.exception_handler(StarletteHTTPException)
async def http_handler(request: Request, exc: StarletteHTTPException):
    code = "not_found" if exc.status_code == 404 else "http_error"
    return error_response(exc.status_code, code, str(exc.detail))


@app.exception_handler(Exception)
async def unhandled_handler(request: Request, exc: Exception):
    return error_response(500, "internal_error", str(exc))


app.include_router(chat.router)
app.include_router(vision.router)
app.include_router(models_router)
