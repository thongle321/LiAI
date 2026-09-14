"""Throwaway stub-VLM backend runner (scratch only).

Proves webcam -> ws -> narration WITHOUT downloading the ~1GB VLM:
patches describe_frame to a canned string, skips warmup weights,
then serves the real ws.py loop so frame/caption logs still fire.

Run:  cd D:/aivision/backend
      uv run python ../scratch/run_backend_stub.py
Then: cd D:/aivision
      uv run --with opencv-python --with websockets scratch/webcam_ws.py
Look in THIS terminal for "first frame received" + "caption sent".
"""

import logging

import uvicorn

import app.realtime.vlm as vlm

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")


async def _fake_describe(image: bytes, question: str) -> str:
    return f"[STUB-VLM] {len(image)}-byte JPEG answers: {question}"


vlm.describe_frame = _fake_describe  # type: ignore[method-assign]
vlm.warmup = lambda: None  # type: ignore[method-assign]

if __name__ == "__main__":
    print("stub backend on http://0.0.0.0:8000 (Ctrl+C to stop)...")
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, log_level="info")
