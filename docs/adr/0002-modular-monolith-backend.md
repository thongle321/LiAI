# ADR-0002: Modular Monolith for Backend

Date: 2026-09-23
Status: Accepted

Implementation: steps 0–7 landed 2026-09-23 on `dev`
(one commit per step). Q8 deviation: caption persistence stays inline —
the caption message carries `session_id` synchronously and the tick path
is VLM-bound (seconds), so store IO is noise; deferral would break the
client contract for no measurable gain.
`app/providers/`, `app/db/` (client factory), `app/config/` stay top-level:
moving them into `shared/` is pure churn — they are already shared leaves
with no lateral importers, and the dependency rules (which hold, gated)
matter more than the directory picture.
Deciders: backend

## Context

Backend is ~20 files under `backend/app/` but organized by technical layer
(`agents/`, `memory/`, `realtime/`, `schemas/`, `db/`, `config/`) instead of
by feature. Pain points observed in code:

- `app/main.py` (~200 lines) is the god-file: all HTTP + WS routes, error
  envelope, image decode, model upload streaming in one place.
- `app/turns.py::run_turn` is a cross-cutting orchestrator imported by both
  `main.py` (chat) and `realtime/qa.py` (frame Q&A). Change ripples both ways.
- `realtime/` splits framing (`ws.py`), policy (`qa.py`), inference (`vlm.py`)
  but `qa.py` reaches back into `memory` + `turns`, and `ws.py` reaches into
  `schemas` — no public boundary.
- `agents/companion.py` imports `memory` + `providers` directly; providers,
  memory, db are globals any module can reach into.
- `schemas/` is centralized (`chat.py`, `vision.py`) so chat/vision changes
  touch the same package.

Result: no bounded context — chat, vision, models, companion all mix.

## Validation against external sources (2026-09-23)

Checked against FastAPI modular-monolith practice
([modular-monolith-practice](https://github.com/Khaled-Farhat/modular-monolith-practice):
`internal/` private + `shared/` public per module, cross-module only via
`app.<module>.shared`, wired in `app/container.py`) and industry consensus
(each module owns its schema; modules hide internals, expose contracts via
APIs/events; single DB is fine to start; adopt the dependency rule first and
let contexts emerge). Verdict: direction correct, details fixed below.

Fixes applied: (1) public surface is now explicit (`__init__.py` re-exports +
`internal/` convention) instead of an unenforceable "internals private"
claim; (2) data ownership added — `companion` owns conversation persistence,
`vision` persists via its public API, never `store.append` directly;
(3) side-effects via explicit service call (in-process events later, no broker
now); (4) composition root named (`main.py` + DI wiring); (5) ruff claim
corrected — enforcement is the stdlib-`ast` boundary test, ruff only for
import sorting.

## Multi-perspective review (2026-09-23)

Three background agents + direct FastAPI-docs verification. Full notes with
per-claim citations: `docs/research/2026-09-23-modular-monolith-perspectives.md`.

- **DDD strategist**: modules must map to bounded contexts (linguistic +
  ownership boundaries, not folder splits); every upstream/downstream edge
  names its context-mapping pattern; shared kernel stays tiny;
  schema-per-module on one physical DB; repositories live with their owning
  module, not in `shared/`.
- **FastAPI practitioner**: `APIRouter` + thin `main.py` is the framework's own
  scale-up pattern; shared resources belong in `Dependencies` with `yield` +
  `dependency_overrides` in tests (gap found: `main.py` and `qa.py` call the
  `get_store()` global directly — no wiring exists yet); the `ast` test is a
  CI lint, not a boundary (import-linter `forbidden` contract later, needs
  dep approval); agent tests should use `TestModel`/`FunctionModel` +
  `Agent.override()`, not factory monkeypatching.
- **Skeptic/ops**: thin routers + one seam first (strangler-fig); add
  `modules/` only on second reuse; each step reversible (≤1 PR) with
  stop-conditions; boundary test warn-only until 2 extractions land;
  per-module observability only with its own SLO.

## Decision

Refactor to a **modular monolith** with strict isolation:

- One deployable (keep FastAPI single process, keep Supabase).
- Feature modules with explicit public surface: `__init__.py` re-exports +
  `internal/` for private implementation (mirrors the reference practice:
  cross-module imports only via `app.modules.<name>`, never
  `app.modules.<name>.internal`).
- Cross-module calls go through the public API only — no deep imports.
- Data ownership: `companion` owns conversation persistence (tables +
  store impl); `chat`/`vision` persist via its public `run_turn` /
  `append_assistant_text`, never direct `store.append` or SQL. Single
  Supabase DB is fine; each module owns its tables and does not write to
  another module's tables.
- Side-effects (e.g. narration caption stored) are explicit service calls
  today; introduce in-process domain events only when a second subscriber
  appears (no broker, no new dep now).
- Shared kernel holds only what ≥2 modules truly share: error envelope,
  `Turn`/`ConversationStore` port (Protocol), provider port, config boot.
  Store *implementation* lives with its owner, not in the kernel.

Target tree (incremental, no new deps):

```text
backend/app/
  main.py              # composition root: lifespan, middleware, mount routers
                       # (DI via Depends providers arrives in migration step 3 —
                       #  today callers use the get_store() global directly)
  modules/
    chat/              # POST /api/chat, GET /api/history
      __init__.py      # public: router, service fns (re-export only)
      router.py        # thin: parse -> service -> map response
      internal/        # chat-only helpers (never imported cross-module)
      schemas.py       # ChatRequest/Response, History*
    vision/            # WS /api/vision/ws, frame Q&A, narration
      __init__.py      # public: router, answer_about_frame
      router.py        # handle_vision_socket wiring only
      internal/        # ws framing, qa policy, vlm boundary
      schemas.py       # VisionClientMessage
    models/            # GGUF upload/list/delete
      __init__.py      # public: router, service fns
      router.py
      internal/        # safe_name/path_for/list (from model_files.py)
      schemas.py
    companion/         # agent reasoning, tools, personality + turn seam
      __init__.py      # public: run_turn, append_assistant_text, get_companion_agent
      agent.py         # get_companion_agent, adapters (from agents/companion.py)
      tools.py         # get_current_time + future tools
      service.py       # run_turn turn seam (moved from turns.py)
      store.py         # conversation persistence impl (owner of its tables)
  shared/
    kernel.py          # ErrorDetail/ErrorResponse + _error() envelope
    ports.py           # ConversationStore + ChatProvider Protocols (types only)
    providers/         # ChatProvider impl + factory (as today)
    db/                # Supabase client factory only; repositories live with
                       # their owning module (e.g. companion/store.py)
    config/            # boot (.env), personality prompt
```

Dependency rules (strict):

1. `modules/*` may import from `shared/*` only, plus the single allowed
   edge below.
2. `modules/chat` and `modules/vision` are downstream **conformists** to
   `modules/companion` (**customer/supplier** edge): they may import only
   the published `run_turn` contract from `modules/companion/__init__.py` —
   never `modules/companion.service/agent/internal` paths, nothing else
   cross-module. (`qa.py` reaching into `memory` + `turns` today is exactly
   the unmapped coupling this fixes.)
3. No `modules/chat ↔ modules/vision`, no `modules/* → router.py` of another
   module, no `*.internal.*` imports across modules, no direct writes to
   another module's tables.
4. Enforce with `tests/test_module_boundaries.py` (stdlib `ast`: allow-list
   of rules 1–3, deny `internal` cross-imports + cross-module table access).
   Honest framing: this is a CI lint, not an architectural boundary (blind to
   dynamic imports, enforces nothing at import time) — warn-only until 2
   module extractions land, then deny. Ruff only for import sorting (`isort`
   known-first-party `app.modules, app.shared`); an import-linter
   `forbidden` contract is the later upgrade (needs new-dep approval).

Considered options:

- **A. Thin routers only** (split `main.py` into `APIRouter`s, no moves):
  cheapest, fixes god-file but leaves layer-mixing. **Adopted as migration
  step 1** (strangler-fig) with a stop-condition — not rejected.
- **B. Feature modules + strict isolation (chosen)**: fixes god-file and
  cross-imports, keeps single deployable, matches `backend/AGENTS.md`
  "API routes / application logic / agents / providers / memory / db" split.
- **C. Microservices** (chat vs vision vs models services): rejected — team
  size 1, no scaling pressure, doubles ops (auth, deploy, Supabase wiring).

## Consequences

Good: each feature readable/testable in isolation (`chat` tests patch
`companion/service.run_turn`, `vision` tests patch `vlm.describe_frame`);
`main.py` shrinks to ~40 lines; new features (voice, tools, search) get a new
`modules/<feature>/` instead of growing `main.py`.

Bad: file moves break open PRs; `run_turn` move touches both chat and vision
call sites at once; strict rules need discipline (boundary test) until the
team internalizes them.

Over-modularization risk (flagged by external sources: adopt the dependency
rule first, let contexts emerge): ~20 files do not need 4 modules on day one.
Each migration step below is independently shippable — stop after any step if
the pain is resolved; the remaining steps stay open, not mandatory.

Mitigations: migrate one module at a time (models → chat → vision →
companion), keep tests green each step; old import paths re-export with
`DeprecationWarning` for one step then delete.

## Migration plan (no behavior change, strangler-fig: each step shippable, each step stoppable)

0. **Boundary test first (warn-only)**: add `tests/test_module_boundaries.py`
   (stdlib `ast` allow-list of rules 1–3; report-only). It must exist *before*
   any move, otherwise rules are unenforced during the moves. Flip to deny
   after 2 module extractions land.
1. **Thin routers**: split `main.py` routes into `APIRouter`s
   (`chat`, `vision`, `models`) with `include_router(prefix=...)` in a
   ~40-line `main.py` — no file moves, no import-path changes.
   **Stop-condition:** if contract tests stay green and the god-file pain is
   gone, stop here; steps below stay open, not mandatory.
2. **Shared kernel**: extract `_error()` → `shared/kernel.py`, ports
   (`ConversationStore`, `ChatProvider` Protocols) → `shared/ports.py`;
   re-export from old paths. Tests: existing contract tests pass.
3. **DI wiring**: serve store/agent via `Depends` providers in routers
   (closes the honest gap: `main.py` and `qa.py` call `get_store()` directly
   today); tests swap via `dependency_overrides`. Keep `get_store()` as the
   default provider during transition.
4. **Models module** (only if step 1 proved insufficient — second-reuse
   rule): move `model_files.py` → `modules/models/internal/`, routes →
   `router.py`, mount in `main.py`. Tests: `test_models_routes.py`.
5. **Companion module**: move `turns.py` → `modules/companion/service.py`,
   `agents/companion.py` → `modules/companion/agent.py`, store impl →
   `modules/companion/store.py` (repositories live with their owner, never in
   `shared/db/`). Update chat/vision imports to the public `__init__`.
   `vision.store_caption` becomes `companion.append_assistant_text` (ownership
   fix). Agent tests migrate to pydantic-ai `TestModel`/`FunctionModel` +
   `Agent.override()` instead of monkeypatching the factory (`conftest.py`
   today). Tests: `test_run_turn.py`, `test_agent_seam.py`.
6. **Chat, then vision modules**: move routes/schemas into `modules/chat/`,
   `realtime/*` → `modules/vision/internal/`. Per-module router tests mount
   only that router (`TestClient`). Caption persistence may move to
   `BackgroundTasks` so the WS path never awaits the store. Tests:
   `test_chat.py`, `test_history.py`, `test_realtime.py`, `test_vlm_*.py`.
7. **Cleanup**: delete deprecated re-exports; flip boundary test to deny.

Reversibility: every step keeps the old import path as a re-export;
revert = delete new dir, restore mount (≤1 PR). Per-module observability
only when a module gets its own SLO/error budget.

## References

- `backend/AGENTS.md` — Architecture section (routes/logic/agents/providers/
  memory/db split; create layers only when needed)
- `backend/app/main.py`, `app/turns.py`, `app/realtime/qa.py`,
  `app/agents/companion.py` — current seams analyzed
- [FastAPI: Bigger Applications](https://fastapi.tiangolo.com/tutorial/bigger-applications/) —
  `APIRouter` + thin `main.py` + shared `dependencies.py` + `internal/` subpackage
- [FastAPI: Dependencies](https://fastapi.tiangolo.com/tutorial/dependencies/) —
  shared resources via `Depends`/`yield`, `dependency_overrides` in tests
- [FastAPI: Testing](https://fastapi.tiangolo.com/tutorial/testing/) —
  `TestClient`, per-module router isolation
- [FastAPI: BackgroundTasks](https://fastapi.tiangolo.com/tutorial/background-tasks/) —
  post-response side-effects out of the request path
- [pydantic-ai: Testing](https://ai.pydantic.dev/agents/testing/) —
  `TestModel`/`FunctionModel` + `Agent.override()` seam
- [import-linter](https://import-linter.readthedocs.io/en/stable/) —
  `forbidden`/`layers` contracts as the later enforcement upgrade
- [modular-monolith-practice](https://github.com/Khaled-Farhat/modular-monolith-practice) —
  FastAPI reference: `internal/` private + `shared/` public per module,
  cross-module only via public surface, container wiring, per-module tests
- [Grzybek: modular-monolith-with-ddd](https://github.com/kgrzybek/modular-monolith-with-ddd) —
  strict module boundaries, public API only, module owns its schema
- [Fowler: BoundedContext](https://martinfowler.com/bliki/BoundedContext.html) —
  contexts as linguistic/ownership boundaries, explicit context mapping
- [Fowler: MonolithFirst](https://martinfowler.com/bliki/MonolithFirst.html) +
  [StranglerFig](https://martinfowler.com/bliki/StranglerFigApplication.html) —
  start monolithic, extract one seam at a time
- [Shopify: deconstructing the monolith](https://shopify.engineering/deconstructing-monolith-design-clean-modular-codebases) —
  in-process component boundaries (packs) at scale
- [Atlantic Money: microservices → monolith](https://www.atlantic.money/blog/we-moved-from-microservices-to-a-monolith-and-saw-massive-gains) —
  distributed-monolith cautionary tale
- Full per-claim notes: `docs/research/2026-09-23-modular-monolith-perspectives.md`
- ADR-0001 — prior decision format reference
