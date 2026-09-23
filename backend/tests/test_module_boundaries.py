"""Module boundary gate (ADR-0002): warn-only until 2 extractions land.

Stdlib `ast` scan over `app/` — a CI lint, not an architectural boundary
(blind to dynamic imports, enforces nothing at import time). Set
`MODULE_BOUNDARIES=deny` to flip to hard failure (step 7); import-linter
`forbidden` contract is the later upgrade.
"""

import ast
import os
import warnings
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parent.parent / "app"

# Lateral edges allowed beyond shared/*: downstream conformists → companion.
ALLOWED_LATERAL = {
    ("chat", "companion"),
    ("vision", "companion"),
}


def _absolute_imports(tree: ast.Module, module_name: str) -> list[str]:
    """All absolute `app.*` imports of one file (relative resolved)."""
    found: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            found.extend(a.name for a in node.names)
        elif isinstance(node, ast.ImportFrom):
            if node.level:
                parts = module_name.split(".")
                base = parts[: len(parts) - node.level + 1]
                mod = ".".join(base + (node.module.split(".") if node.module else []))
            else:
                mod = node.module or ""
            if mod:
                found.append(mod)
    return [f for f in found if f == "app" or f.startswith("app.")]


def _module_of(path: Path, root: Path) -> str:
    rel = path.relative_to(root.parent).with_suffix("")
    return ".".join(rel.parts)


def _mod_name(mod: str) -> str | None:
    parts = mod.split(".")
    if len(parts) >= 3 and parts[0] == "app" and parts[1] == "modules":
        return parts[2]
    return None


def find_violations(root: Path = APP_ROOT) -> list[str]:
    """Rule 1–3 violations as human-readable strings (pure, unit-testable)."""
    violations: list[str] = []
    for path in sorted(root.rglob("*.py")):
        importer = _module_of(path, root)
        importer_mod = _mod_name(importer)
        try:
            tree = ast.parse(path.read_text(encoding="utf-8"))
        except SyntaxError as exc:
            violations.append(f"{importer}: unparseable ({exc})")
            continue
        for imp in _absolute_imports(tree, importer):
            target_mod = _mod_name(imp)
            if target_mod is None:
                if importer_mod and imp.startswith("app.modules."):
                    violations.append(f"{importer} → {imp}: cross-module deep import")
                continue
            if target_mod == importer_mod:
                continue
            if "internal" in imp.split(target_mod, 1)[1].split("."):
                violations.append(f"{importer} → {imp}: internal cross-import")
            elif (importer_mod, target_mod) not in ALLOWED_LATERAL:
                violations.append(f"{importer} → {imp}: lateral import")
    return violations


def test_module_boundaries() -> None:
    violations = find_violations()
    if os.getenv("MODULE_BOUNDARIES", "warn") == "deny":
        assert not violations, "boundary violations:\n" + "\n".join(violations)
    elif violations:
        warnings.warn(
            "module boundary drift (warn-only):\n" + "\n".join(violations),
            stacklevel=2,
        )


def test_checker_catches_internal_cross_import(tmp_path: Path) -> None:
    pkg = tmp_path / "app" / "modules"
    (pkg / "vision").mkdir(parents=True)
    (pkg / "chat").mkdir(parents=True)
    (pkg / "vision" / "ws.py").write_text(
        "from app.modules.chat.internal import secret\n", encoding="utf-8"
    )
    (pkg / "chat" / "router.py").write_text("x = 1\n", encoding="utf-8"
    )
    found = find_violations(tmp_path / "app")
    assert any("internal cross-import" in v for v in found), found


def test_checker_allows_conformist_edge(tmp_path: Path) -> None:
    pkg = tmp_path / "app" / "modules"
    (pkg / "chat").mkdir(parents=True)
    (pkg / "chat" / "router.py").write_text(
        "from app.modules.companion import run_turn\n", encoding="utf-8"
    )
    assert find_violations(tmp_path / "app") == []
