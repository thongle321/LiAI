"""Models DTOs: upload/list shapes owned by the models module."""

from pydantic import BaseModel


class ModelUploadResponse(BaseModel):
    filename: str
    size_bytes: int
    path: str


class ModelListResponse(BaseModel):
    models: list[str]


__all__ = ["ModelListResponse", "ModelUploadResponse"]
