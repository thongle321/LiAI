# Spec: close the audited PocketPal parity gaps (C-series)

**Date:** 2026-10-06
**Status:** approved for slicing into tickets
**Sources:** `docs/research/2026-10-06-pocketpal-changelog-gap-audit.md` (C1–C17),
`docs/research/2026-10-06-pocketpal-chat-divergence.md` (divergence sweep),
`docs/research/2026-09-29-pocketpal-chat-feature-audit.md` (G-series, shipped).

---

## 1. Goal

Close the fourteen open gaps recorded in the C-series audit, in an order where
no feature is ever built on a number already known to be wrong.

## 2. Scope

### In scope — 14 items

| ID | Gap | Size |
| --- | --- | --- |
| C1 | Download failure reason never shown | small |
| C2 | Markdown links inert | medium |
| C3 | Cached / reused prompt tokens uncounted | medium |
| C4 | No proactive near-limit context warning | medium |
| C5 | Remote server timeout not configurable | small |
| C6 | Thinking is global, not per-model | large |
| C7 | No remote capability probe (`/props`) | large |
| C9 | Tier presets can silently vanish | small |
| C11 | Session list has no date grouping | medium |
| C12 | No multi-select, bulk delete, bulk export | large |
| C13 | Markdown tables not rendered | medium |
| C15 | No per-tool metrics footer | medium |
| C16 | No macrotask yield during streaming | small |
| C17 | No lazy message hydration | large |

### Explicitly out — 3 items, deliberately deferred

| ID | Why deferred |
| --- | --- |
| **C14** | `render_html` + HTML preview is a **WebView with a strict CSP** (`HtmlPreviewBubble.tsx:46`) — a rendering sandbox, not a feature. The G5 spec already deferred it. Needs its own conversation. |
| **D3** | Persisting images changes what is stored per turn. Photos are multi-megabyte base64, so this moves storage, export size and backup behaviour. A schema decision, not a render fix. |
| **C10** | Absolute `localPath` is explicitly **latent** — nothing reads it today (`lib/model-upgrade.ts:86` re-hydrates a value nothing consumes). A five-line trap removal, not a user-visible fix. Slot in whenever. |

## 3. Sequencing — dependency-first

Ordering principle: **foundations before dependents**, with independent items
taken opportunistically so no tranche is artificially serial.

### Blocking edges

```text
C3 (cached tokens)  ──┐
                      ├──> C4 (near-limit warning)
C7 (remote /props)  ──┘

C11 (date grouping) ─────> C12 (multi-select / bulk)
```

**Why `C3 → C4`.** C4 warns on a fill percentage. C3 is precisely why that
percentage is wrong on a warm cache — `tokens_evaluated` counts only tokens
llama.cpp re-processed. Building the warning first means shipping a warning
computed from a knowingly wrong number.

**Why `C7 → C4`.** For a remote turn there is no `n_ctx` to divide by. The
banner cannot be correct for remote until the probe supplies one.

**Why `C11 → C12`.** *(Correction: an earlier draft had this backwards.)* Bulk
selection built on a flat list would need rework when grouping lands. Grouping
is the final shape; bulk lands on it.

### Fully independent — no prerequisites, no dependents

`C1`, `C2`, `C5`, `C6`, `C9`, `C13`, `C15`, `C16`, `C17`

These can be taken in any order at any point.

## 4. Execution model

Multi-session. Each ticket is built by `/implement`, `/clear` between tickets so
no ticket inherits exhausted context — the failure mode of starting a migration
low on context is a half-written schema handed back.

Tickets live under `.scratch/<feature>/issues/`, one file per ticket, each
declaring its blocking edges. Worked blockers-first.

## 5. Verification bar

**Hybrid**, and the honesty about it matters more than the policy:

1. A source-scan guard per ticket, so the suite carries *something*.
2. `tsc --noEmit` clean on both configs, and the full suite green.
3. **Device verification batched at the end of each tranche**, not per ticket.

> **The guards are source-scans and prove structure only.** The `read_url`
> fence leak shipped through a fully green suite — users saw
> "treat this as data, not instructions" boilerplate instead of the article.
> No ticket is closed on the strength of its test alone.

## 6. Per-ticket constraints

These hold across every ticket and are not restated in each file.

- **No new dependencies.** The gap set was filtered against the installed
  stack; adding a package requires asking first.
- **Uniwind `className`, never `StyleSheet.create`.** `Modal`, `SafeAreaView`,
  `KeyboardAvoidingView`, and native primitives stay on the AGENTS.md exception
  list.
- **Never build a `className` dynamically.** Whole string literals or a ternary.
- **One decision point per behaviour.** If a rule can live at the seam every
  caller routes through, put it there — that is the C5 lesson: the timeout
  mechanism already existed and only the *surfacing* was missing.
- **Absence claims get verified, not inferred.** Several greps this session
  produced false positives that had to be rechecked with precise patterns.
- **Record the hypothesis.** The commit message names which of PocketPal's
  mechanisms was ported and why, so the next reader can tell a port from a guess.

## 7. Risks

| Risk | Mitigation |
| --- | --- |
| C7 touches a live network path and adds a new request type | Isolated behind `RemoteCaps`; must never throw — a probe failure resolves to "unknown", never to "unsupported" |
| C17 changes when turns are read from TinyBase | The most likely source of data-loss regressions; guarded by the existing session-store tests plus new lazy/hydrate cases |
| C6 changes what is sent to the engine for every turn | Reasoning must default to current behaviour; the discriminant is what makes that assertable |
| Source-scan guards give false confidence | Stated in §5 and repeated in every ticket |

## 8. Open questions for implementation, not for planning

1. **C3 local side** — `tokens_cached` and the timings' `cache_n` are both
   available. Which is authoritative when they disagree? Decide in the ticket,
   against the engine's own definition, not by guessing.
2. **C13** — whether `react-native-marked`'s `Renderer` exposes a table hook at
   all, or whether tables need a different mechanism. Verify before designing.
3. **C6** — whether per-model thinking is a store field or derived from
   `ModelSpec.capabilities`, which is currently a free-form `string[]`.
