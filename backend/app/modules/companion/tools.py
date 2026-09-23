"""Companion tool implementations (pure; registered on the agent in agent.py)."""

from datetime import datetime


def local_time() -> str:
    """Current local time as an ISO-8601 string (injectable via clock)."""
    return datetime.now().astimezone().isoformat()
