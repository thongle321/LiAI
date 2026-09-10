"""Stream edge token minting. Secret stays server-side; phone gets a token."""

import os
import uuid

from getstream import Stream


def mint_realtime_token() -> tuple[str, str, str]:
    """Return (client_token, call_id, user_id) for one ephemeral call.

    The caller must join as user_id — derived from call_id so both
    sides agree without extra round-trips.
    """
    key = os.getenv("STREAM_API_KEY", "")
    secret = os.getenv("STREAM_API_SECRET", "")
    if not key or not secret:
        raise RuntimeError("realtime edge not configured")
    call_id = f"liai-{uuid.uuid4().hex[:12]}"
    user_id = f"caller-{call_id}"
    client = Stream(api_key=key, api_secret=secret)
    token = client.create_call_token(user_id, call_cids=[f"default:{call_id}"])
    return token, call_id, user_id
