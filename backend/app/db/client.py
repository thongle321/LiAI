"""Supabase client singleton. Only module that reads Supabase env + imports the SDK."""

import os

from supabase import Client, create_client

_client: Client | None = None


def get_client() -> Client:
    """Lazily built client; fails fast when credentials are missing."""
    global _client
    if _client is None:
        url = os.getenv("SUPABASE_URL", "")
        key = os.getenv("SUPABASE_SECRET_KEY", "")
        if not url or not key:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SECRET_KEY must be set")
        _client = create_client(url, key)
    return _client
