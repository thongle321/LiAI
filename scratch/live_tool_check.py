"""Q6 live gate: the real OpenRouter model must invoke get_current_time.

Run from backend/:  $env:OPENROUTER_API_KEY='<REDACTED>'  (never paste the key anywhere)
                    uv run python ../.scratch/live_tool_check.py
Optional:           $env:OPENROUTER_MODEL='openai/gpt-4o-mini'  (default)

PASS = reply contains a plausible current time AND stored turns == [user, assistant].
Paste back the printed lines with any key material redacted.
"""

import os

_HERE = os.path.dirname(os.path.abspath(__file__))
_DOTENV = os.path.join(_HERE, "..", "backend", ".env")

# ponytail: 5-line dotenv so no new dependency; real env wins over .env
if os.path.exists(_DOTENV):
    with open(_DOTENV, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())

os.environ["LLM_PROVIDER"] = "openrouter"
assert os.getenv("OPENROUTER_API_KEY"), "no OPENROUTER_API_KEY in env or backend/.env"

from app.main import app
from app.memory import get_store
from fastapi.testclient import TestClient

client = TestClient(app)
body = client.post("/api/chat", json={"message": "what time is it?"}).json()
print("keys:", sorted(body.keys()))
print("reply:", body.get("reply", body))
turns = get_store().get(str(body.get("session_id", "")))
print(
    "stored:",
    [(t.role, t.content[:80]) for t in turns] if turns is not None else None,
)
