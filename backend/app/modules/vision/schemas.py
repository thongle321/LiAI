"""Vision DTOs: socket message shapes owned by the vision module."""

from typing import Literal

from pydantic import BaseModel


class FrameMessage(BaseModel):
    type: Literal["frame"]
    jpeg: str


class QuestionMessage(BaseModel):
    type: Literal["question"]
    text: str


VisionClientMessage = FrameMessage | QuestionMessage

__all__ = ["FrameMessage", "QuestionMessage", "VisionClientMessage"]
