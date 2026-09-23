"""The one error envelope every route speaks (ADR-0002 shared kernel)."""

from fastapi.responses import JSONResponse

from ..schemas import ErrorDetail, ErrorResponse


def error_response(status_code: int, code: str, message: str) -> JSONResponse:
    """One envelope for every failure, built from the shared schema."""
    body = ErrorResponse(error=ErrorDetail(code=code, message=message))
    return JSONResponse(status_code=status_code, content=body.model_dump())
