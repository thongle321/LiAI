"""Supabase access. Sole SDK touchpoint; memory/ and routes consume repositories."""

from .client import get_client

__all__ = ["get_client"]
