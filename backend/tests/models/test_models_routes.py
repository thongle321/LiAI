"""GGUF file routes: path rules + lifecycle through the HTTP interface.

main.py mixed chat/history/vision/file IO; model-file rules now live in
one module and are proven at the route seam (400/404/409/200 + traversal).
"""

import io

import pytest
from fastapi.testclient import TestClient
from httpx2 import Response

from app.main import app
from app.modules.models import internal as model_files

client = TestClient(app)


@pytest.fixture
def models_dir(tmp_path, monkeypatch: pytest.MonkeyPatch):  # type: ignore[no-untyped-def]
    path = tmp_path / "models"
    path.mkdir()
    monkeypatch.setattr(model_files, "MODELS_DIR", path)
    return path


def _upload(name: str, payload: bytes = b"gguf-bytes") -> Response:
    return client.post(
        "/api/models/upload",
        files={"file": (name, io.BytesIO(payload), "application/octet-stream")},
    )


def test_upload_rejects_non_gguf(models_dir) -> None:  # type: ignore[no-untyped-def]
    resp = _upload("weights.bin")
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "invalid_request"


def test_upload_sanitizes_traversal_name(models_dir) -> None:  # type: ignore[no-untyped-def]
    resp = _upload("../../evil.gguf")
    assert resp.status_code == 200
    body = resp.json()
    assert body["filename"] == "evil.gguf"
    assert (models_dir / "evil.gguf").is_file()
    assert not (models_dir.parent / "evil.gguf").exists()
    assert not (models_dir / ".." / ".." / "evil.gguf").exists()


def test_upload_conflict_is_409(models_dir) -> None:  # type: ignore[no-untyped-def]
    assert _upload("dup.gguf").status_code == 200
    resp = _upload("dup.gguf")
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "conflict"


def test_list_returns_sorted_gguf_only(models_dir) -> None:  # type: ignore[no-untyped-def]
    (models_dir / "b.gguf").write_bytes(b"b")
    (models_dir / "a.gguf").write_bytes(b"a")
    (models_dir / "notes.txt").write_text("x")
    resp = client.get("/api/models")
    assert resp.status_code == 200
    assert resp.json() == {"models": ["a.gguf", "b.gguf"]}


def test_delete_missing_is_404(models_dir) -> None:  # type: ignore[no-untyped-def]
    resp = client.delete("/api/models/ghost.gguf")
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "not_found"


def test_delete_rejects_non_gguf(models_dir) -> None:  # type: ignore[no-untyped-def]
    resp = client.delete("/api/models/anything.txt")
    assert resp.status_code == 400


def test_delete_sanitizes_traversal(models_dir) -> None:  # type: ignore[no-untyped-def]
    # path_for strips directories (../ never escapes); HTTP clients also
    # normalize ../ before the route — containment is proven at the seam.
    outside = models_dir.parent / "secret.gguf"
    outside.write_bytes(b"s")
    inside = models_dir / "secret.gguf"
    inside.write_bytes(b"s")
    assert model_files.path_for("../../secret.gguf") == inside
    resp = client.delete("/api/models/secret.gguf")
    assert resp.status_code == 200
    assert not inside.exists()
    assert outside.exists()  # untouched — no escape


def test_delete_removes_file(models_dir) -> None:  # type: ignore[no-untyped-def]
    (models_dir / "gone.gguf").write_bytes(b"g")
    resp = client.delete("/api/models/gone.gguf")
    assert resp.status_code == 200
    assert not (models_dir / "gone.gguf").exists()
    listed = client.get("/api/models").json()["models"]
    assert "gone.gguf" not in listed
