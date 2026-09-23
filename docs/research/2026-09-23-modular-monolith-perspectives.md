# Modular Monolith — Multi-Perspective Research Notes

Date: 2026-09-23. Question: is ADR-0002's modular-monolith plan correct for
the LiAI Python/FastAPI backend? Three background agents + direct FastAPI-docs
verification. Every claim cites its owning (primary) source. Synthesized into
`docs/adr/0002-modular-monolith-backend.md` (status: Proposed, docs-only change).

## 1. DDD strategist view

- Bounded contexts are linguistic + ownership boundaries, not folder splits;
  modules should map to them.
  Source: https://martinfowler.com/bliki/BoundedContext.html
- Each upstream/downstream edge must name its context-mapping pattern
  (shared kernel, customer/supplier, conformist, anti-corruption layer).
  Source: https://martinfowler.com/bliki/BoundedContext.html
- Shared kernel must stay tiny; over-sharing re-couples the contexts it was
  meant to separate. Source: https://domainlanguage.com/ddd/
- Protect each context with ACLs/ports; implementation per context, contracts
  published. Source: https://github.com/VaughnVernon/IDDD_Samples
- Start as a monolith; extract services only under real scaling/team pressure.
  Source: https://martinfowler.com/bliki/MonolithFirst.html
- Modular monolith = strict module boundaries, public API only, internals
  never imported cross-module.
  Source: https://github.com/kgrzybek/modular-monolith-with-ddd
- Data ownership: one physical DB is fine, but each module owns its
  schema/tables; no cross-module writes; integration via public API/events.
  Source: https://github.com/kgrzybek/modular-monolith-with-ddd
- Modules depend on abstractions/ports; concrete wiring lives in one
  composition root.
  Source: https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures
- Applied corrections: chat/vision edge named (downstream conformists,
  customer/supplier on the `run_turn` contract); `shared/db/` reduced to the
  client factory with repositories in their owning module; unverifiable
  "industry consensus (search)" replaced by the named sources above.

## 2. FastAPI/Python practitioner view

- Scale-up pattern is `APIRouter` per feature + `include_router(prefix=...)`;
  routers stay thin, logic in dependencies/services.
  Source: https://fastapi.tiangolo.com/tutorial/bigger-applications/
- The official structure itself uses an `internal/` subpackage for private
  code (`app/internal/admin.py`) — the ADR's `internal/` convention matches
  the framework author's intent.
  Source: https://fastapi.tiangolo.com/tutorial/bigger-applications/
- Shared resources (DB session, store, settings) belong in `Dependencies`
  with `yield`, not module-global singletons; tests swap via
  `dependency_overrides`. Gap found: `main.py` and `qa.py` call the
  `get_store()` global directly — no wiring exists yet.
  Source: https://fastapi.tiangolo.com/tutorial/dependencies/
- Route tests use `TestClient`; per-module router tests mount only that
  router for isolation.
  Source: https://fastapi.tiangolo.com/tutorial/testing/
- Post-response side-effects (e.g. persisting a narration caption) belong in
  `BackgroundTasks`, not inline awaits in the WS/route path.
  Source: https://fastapi.tiangolo.com/tutorial/background-tasks/
- pydantic-ai's test seam is `TestModel`/`FunctionModel` + `Agent.override()`,
  not monkeypatching the factory — current `conftest.py` monkeypatch works
  but bypasses the framework seam.
  Source: https://ai.pydantic.dev/agents/testing/
- Reference practice: per-module `internal/` (private) + `shared/` (public),
  cross-module only via the public surface, container wiring, per-module tests.
  Source: https://github.com/Khaled-Farhat/modular-monolith-practice
- Nothing in Python packaging enforces "no cross-module import" — only CI
  does; import-linter `forbidden`/`layers`/`independence` contracts are the
  purpose-built gate (later upgrade; needs new-dep approval).
  Source: https://import-linter.readthedocs.io/en/stable/
- A stdlib-`ast` boundary test detects static imports but misses dynamic
  imports and enforces nothing at import time — a CI lint, not a boundary.
  Source: https://docs.python.org/3/library/ast.html
- Applied corrections: DI wiring added as migration step 3;
  `TestModel`/`Agent.override()` noted in step 5; boundary test moved to
  step 0 (before any move) and framed honestly as warn-first lint.

## 3. Skeptic/ops view

- Start with a monolith; microservices' distributed complexity only pays once
  boundaries are proven.
  Source: https://martinfowler.com/bliki/MonolithFirst.html
- Prefer monolith until scale/team pressure forces decomposition; services
  add auth/deploy/wiring ops cost.
  Source: https://learn.microsoft.com/en-us/azure/architecture/guide/architecture-styles/microservices
- Shopify stayed on its Ruby monolith and enforced in-process component
  boundaries (packs/packwerk), scaling via pods, not service splits.
  Source: https://shopify.engineering/deconstructing-monolith-design-clean-modular-codebases
- Shopify pods are a scaling/operational unit around the same monolith, not
  an argument for 4 domain modules on day one.
  Source: https://shopify.engineering/how-shopify-manages-its-kubernetes-clusters
- Khan Academy kept its Python monolith for years, extracting services only
  incrementally under real load. (Agent-cited; URL as reported.)
- Atlantic Money moved microservices → modular monolith with large
  cost/latency/ops wins — the distributed-monolith cautionary tale.
  Source: https://www.atlantic.money/blog/we-moved-from-microservices-to-a-monolith-and-saw-massive-gains
- Prime Video's monitor moved serverless-microservices → monolith, cutting
  cost ~90%: premature distribution is a failure mode.
  Source: https://www.amazon.science/publications/scaling-up-the-prime-video-audio-video-monitoring-service-and-reducing-costs-by-90-percent
- Strangler-fig: extract one seam at a time with stop conditions; wrong early
  cuts ossify and cost more than layered code.
  Source: https://martinfowler.com/bliki/StranglerFigApplication.html
- Applied corrections: step 1 is thin routers + one seam with a stop-condition
  (option A adopted, not rejected); every step reversible (≤1 PR revert);
  `modules/` only on second reuse; boundary test warn-only until 2
  extractions; per-module observability only with its own SLO.

## Net verdict (all views agree)

Direction correct: one deployable + single Supabase DB, microservices
explicitly rejected (right for solo-dev). Fixes landed in ADR-0002:
explicit public surface, data ownership, named context-mapping edge,
DI-wiring gap closed as a step, boundary-test-first (warn→deny), strangler-fig
plan with stop-conditions and reversibility, sources replaced by primary ones.
