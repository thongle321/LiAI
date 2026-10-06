# Research notes — blockers for tickets 07 and 08

Gathered 2026-10-06 by an exploration agent, after the tickets were cut. Both
findings change how those tickets must be built. Cite this file from the ticket
implementers; do not re-derive it.

---

## Q1 — Is a model's maximum context length available?

**Verdict: (b) available with a small addition.** Not available today, but one
read gives it, and no schema change is needed.

### The field exists and is never written

`ModelSpec.ggufMetadata?: Record<string, unknown>` is declared, and nothing in the
codebase ever assigns it. `lib/models/memoryEstimator.ts:6` admits this in its own
comment. The only readers — the sanitiser in `lib/model-upgrade.ts` and the model
card — always read `undefined`.

### llama.rn already exposes it

`loadLlamaModelInfo(path)` returns the full GGUF key-value map
(`node_modules/llama.rn/lib/typescript/index.d.ts:371`). A second route exists —
the initialised context carries `model.metadata` — but the local engine casts that
away today, so the standalone loader is the cheaper read.

### The key is architecture-prefixed

Read `general.architecture`, then look up `<arch>.context_length`. PocketPal's
proven implementation of exactly this read is at its `ModelStore.ts:1848,1868-1888,1931`.
Values may arrive as **strings**, so coerce.

### Where to hook it

Two write paths already funnel into the model store: download completion and
reconcile/local import, both in the downloads slice. Call the loader there and
write through the existing model update action.

**No persistence change is required** — the whole spec is persisted as-is.

### Two bonus effects

- The same read populates the GGUF-derived memory metadata, which removes a dead
  fallback estimate that currently applies an arbitrary multiplier.
- It replaces guesswork in the load path with the model's real numbers.

### Remote models are a different thing

`RemoteCaps.contextLength` is the **server's current context setting**, probed from
the endpoint — not the trained maximum. It is a legitimate ceiling for the ladder,
but it is not a model fact and must not be presented as one.

### Today's ladder has no upper bound at all

The banner filters candidate sizes with only `n > currentNctx`. Nothing bounds the
top end, which is precisely the gap the ladder ticket exists to close.

### Fallback if the read is skipped

The top of the standard ladder, 131072 — which is also what PocketPal falls back to.

---

## Q2 — What must change for ordered blocks in a turn

**Verdict: the trace is complete. Three surprises, one of them a live bug.**

### The ordering is lost one layer below where expected

The turn builder is not the problem. The real loss is in the agent runner:
`reasoning = cumulative` **replaces** the reasoning field on each loop iteration,
so only the final iteration's thinking survives a tool loop. Text accumulates
separately and correctly. **After that assignment, interleaving is
unrecoverable** — so a ticket that only reshapes rendering would be building on
data that has already discarded the ordering it needs.

This also means the app currently shows less reasoning than the model produced,
whenever a tool loop runs more than one iteration. That is a defect in its own
right, independent of parity.

### Types

`AgentStep` and `ChatMessage` live together in `types/chat.ts`; the message carries
a single optional reasoning string. The persisted shape is `StoredTurn` in the
session store.

### Persistence — the additive boundary

Turns are persisted in TinyBase. Cells in these tables **already hold JSON
objects**, so a single `blocks` column on the messages row needs no schema
migration. Export needs no change either — it dumps turns verbatim and the format
version stays put.

### Three places that will break

1. **Restore drops unknown fields silently.** The import path rebuilds messages
   field-by-field and never spreads the source object, so a new field is
   **silently discarded on restore** — no error, just data loss. Worse, the
   supported-format version is `1`, so *bumping* it to advertise a new field would
   refuse every existing backup. The additive design is what avoids having to bump.
2. **A duplicated type.** The chat store carries a second hand-maintained copy of
   the turn-outcome shape. It will drift unless it is updated in the same change.
3. **The bubble assumes one visual unit.** The row shell and its menu wrapper treat
   the reply as a single visual entity; sibling blocks need that reconsidered.

### What does NOT need changing

The tool-surface registry already receives a step object, so it needs no change to
accept blocks. That was the largest surface in the ticket and it turns out to be
already correct.

### PocketPal, for comparison

One row holds one turn's steps as a JSON array, with order given by array index,
rendered as N sibling blocks inside a single row / pressable / avatar.

**Naming warning:** PocketPal's `AgentStep` means a *turn step*, not a tool call.
Do not reuse the name across the two vocabularies — we already use `AgentStep` to
mean a tool call, and that collision is exactly how a port goes wrong quietly.