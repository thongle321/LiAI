"""Shared ingestion guard: both chat (HTTP image) and vision (WS frames) apply
the same JPEG rule, so it lives in the kernel — neither module imports the
other for it (ADR-0002 rule 3)."""

import io

MAX_FRAME_BYTES = 2 * 1024 * 1024


def validate_jpeg(jpeg: bytes) -> None:
    """Size, magic, and actual decodability.

    Corrupt frames fail as invalid_request instead of surfacing as
    llm_error downstream.
    """
    if len(jpeg) > MAX_FRAME_BYTES:
        raise ValueError("frame exceeds size cap")
    if len(jpeg) < 4 or jpeg[0:3] != b"\xff\xd8\xff":
        raise ValueError("not a JPEG frame")
    from PIL import Image

    try:
        with Image.open(io.BytesIO(jpeg)) as picture:
            picture.load()
    except Exception:  # noqa: BLE001 — decode guard maps to ValueError
        raise ValueError("undecodable JPEG frame") from None
