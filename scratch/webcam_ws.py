"""Throwaway webcam -> /api/vision/ws harness (scratch only, not committed).

Exercises the full production vision path with real continuous frames:
webcam JPEG --(ws frame)--> backend narration loop --> caption in backend log
+ echoed here via recv.

Run (stub VLM first — proves webcam -> ws -> caption without weights):
  terminal 1:  cd D:/aivision/backend
               uv run python ../scratch/run_backend_stub.py
  terminal 2:  cd D:/aivision
               uv run --with opencv-python --with websockets scratch/webcam_ws.py
Real VLM (slow on CPU, downloads ~1GB on first run):
  terminal 1:  cd D:/aivision/backend
               uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
Backend captions appear in ITS log (look for "first frame received" +
"caption sent"); this script also prints them via recv.
Stop: Ctrl+C here, then stop the backend.
"""

import asyncio
import base64
import json
import os as _os
import sys

import cv2
from websockets.asyncio.client import connect

URL = _os.getenv("WS_URL", "ws://127.0.0.1:8000/api/vision/ws")
SEND_EVERY_S = 2.0
WIDTH = 480


async def _recv_loop(ws) -> None:
    # ponytail: one recv path so captions/errors are visible client-side too
    try:
        async for raw in ws:
            try:
                msg = json.loads(raw)
            except Exception:
                print(f"non-json from backend: {raw[:120]}")
                continue
            kind = msg.get("type", "?")
            if kind == "caption":
                print(f"caption: {msg.get('text', '')[:200]}", flush=True)
            elif kind == "answer":
                print(f"answer: {msg.get('text', '')[:200]}", flush=True)
            elif kind == "error":
                print(f"backend error: {msg.get('error')}", flush=True)
            else:
                print(f"backend msg: {raw[:200]}", flush=True)
    except Exception as exc:
        print(f"recv ended: {exc}")


async def main() -> None:
    cam = cv2.VideoCapture(0)
    if not cam.isOpened():
        sys.exit("webcam 0 would not open")
    try:
        # ponytail: reconnect on backend restart instead of tracebacks (1012)
        while True:
            try:
                async with connect(URL, max_size=None) as ws:
                    print("connected, streaming webcam frames (Ctrl+C to stop)...")
                    recv_task = asyncio.create_task(_recv_loop(ws))
                    try:
                        while True:
                            ok, frame = cam.read()
                            if not ok:
                                print("webcam read failed, retrying...")
                                await asyncio.sleep(1.0)
                                continue
                            scale = WIDTH / frame.shape[1]
                            small = cv2.resize(frame, (WIDTH, int(frame.shape[0] * scale)))
                            _, buf = cv2.imencode(".jpg", small, [int(cv2.IMWRITE_JPEG_QUALITY), 60])
                            await ws.send(
                                json.dumps(
                                    {
                                        "type": "frame",
                                        "jpeg": base64.b64encode(buf.tobytes()).decode(),
                                    }
                                )
                            )
                            n = getattr(main, "count", 0) + 1
                            setattr(main, "count", n)
                            print(f"sent frame #{n}", flush=True)
                            await asyncio.sleep(SEND_EVERY_S)
                    finally:
                        recv_task.cancel()
            except OSError as exc:
                print(f"connect to {URL} failed ({exc}). Retrying in 2s...", flush=True)
                await asyncio.sleep(2.0)
            except Exception as exc:
                print(f"connection lost ({exc}). Reconnecting in 2s...", flush=True)
                await asyncio.sleep(2.0)
    finally:
        cam.release()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("stopped")
