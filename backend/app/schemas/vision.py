from typing import Literal

from pydantic import BaseModel


class FrameMessage(BaseModel):
    type: Literal["frame"]
    jpeg: str


class QuestionMessage(BaseModel):
    type: Literal["question"]
    text: str


VisionClientMessage = FrameMessage | QuestionMessage
