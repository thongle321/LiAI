"""GGUF model file routes: thin wiring over the internal service."""

import logging

from fastapi import APIRouter, File, Header, UploadFile
from fastapi.responses import JSONResponse

from ...shared.kernel import error_response
from . import internal as model_files
from .schemas import ModelListResponse, ModelUploadResponse

router = APIRouter()

logger = logging.getLogger(__name__)


@router.post("/api/models/upload", response_model=ModelUploadResponse)
async def upload_model(
    file: UploadFile = File(...),  # noqa: B008 — canonical FastAPI UploadFile pattern
) -> ModelUploadResponse | JSONResponse:
    """Upload a GGUF model file from the mobile client to the backend.

    The file is streamed to disk to handle large files (500MB - 4GB+) without
    loading into memory.
    """
    if not file.filename:
        return error_response(400, "invalid_request", "No filename provided")

    if not model_files.is_gguf(file.filename):
        return error_response(400, "invalid_request", "Only .gguf files are supported")

    dest_path = model_files.path_for(file.filename)
    safe_filename = dest_path.name

    if dest_path.exists():
        return error_response(409, "conflict", f"Model {safe_filename} already exists")

    try:
        # Stream the file to disk in chunks
        chunk_size = 1024 * 1024  # 1MB chunks
        total_size = 0

        with open(dest_path, "wb") as f:  # noqa: ASYNC230 — local sequential disk write, chunked streaming
            while True:
                chunk = await file.read(chunk_size)
                if not chunk:
                    break
                f.write(chunk)
                total_size += len(chunk)

        logger.info("Model uploaded: %s (%d bytes)", safe_filename, total_size)

        return ModelUploadResponse(
            filename=safe_filename,
            size_bytes=total_size,
            path=str(dest_path),
        )
    except Exception as exc:  # noqa: BLE001 — upload boundary maps to 500 envelope
        # Clean up partial file on error
        if dest_path.exists():
            dest_path.unlink()
        logger.error("Model upload failed: %s", exc)
        return error_response(500, "upload_failed", str(exc))


@router.get("/api/models", response_model=ModelListResponse)
async def list_models_route() -> ModelListResponse | JSONResponse:
    """List available GGUF models in the backend models directory."""
    try:
        return ModelListResponse(models=model_files.list_models())
    except Exception as exc:  # noqa: BLE001 — list boundary maps to 500 envelope
        return error_response(500, "list_failed", str(exc))


def _hf_error(exc: model_files.HfError) -> JSONResponse:
    code = {400: "invalid_request", 404: "not_found"}.get(exc.status, "http_error")
    return error_response(exc.status, code, str(exc))


@router.get("/api/models/hf/search")
async def hf_search_route(
    q: str = "",
    x_hf_token: str | None = Header(default=None),
) -> JSONResponse:
    """Browse HuggingFace through the backend.

    The token rides a header (never the URL), per request, never stored.
    HF's JSON passes through verbatim so client parsers stay unchanged.
    """
    try:
        return JSONResponse(content=model_files.hf_search(q, x_hf_token))
    except model_files.HfError as exc:
        return _hf_error(exc)


@router.get("/api/models/hf/files")
async def hf_files_route(
    repo: str = "",
    x_hf_token: str | None = Header(default=None),
) -> JSONResponse:
    """List a repo's tree through the backend (same token rule as search)."""
    try:
        return JSONResponse(content=model_files.hf_files(repo, x_hf_token))
    except model_files.HfError as exc:
        return _hf_error(exc)


@router.delete("/api/models/{filename}")
async def delete_model(filename: str) -> JSONResponse:
    """Delete a GGUF model from the backend models directory."""
    safe = model_files.safe_name(filename)
    if not model_files.is_gguf(safe):
        return error_response(400, "invalid_request", "Only .gguf files can be deleted")

    model_path = model_files.path_for(filename)

    if not model_path.exists():
        return error_response(404, "not_found", f"Model {safe} not found")

    try:
        model_path.unlink()
        logger.info("Model deleted: %s", safe)
        return JSONResponse(content={"message": f"Model {safe} deleted"})
    except Exception as exc:  # noqa: BLE001 — delete boundary maps to 500 envelope
        logger.error("Model deletion failed: %s", exc)
        return error_response(500, "delete_failed", str(exc))
