"""Vision module: live camera narration + frame Q&A. Public surface."""

from .internal.qa import answer_about_frame
from .router import router
from .schemas import FrameMessage, QuestionMessage, VisionClientMessage

__all__ = [
    "FrameMessage",
    "QuestionMessage",
    "VisionClientMessage",
    "answer_about_frame",
    "router",
]
