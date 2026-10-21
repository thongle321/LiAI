# Spec: Chat turn signals & run lifecycle (context-full, keep-awake, timings)

Date: 2026-09-29
Status: Draft — awaiting sign-off. **G2 shipped** (see §4).
Audit source: `docs/research/2026-09-29-pocketpal-chat-feature-audit.md` §4 (G1, G2, G4)
Scope: what the chat screen knows about a **running and a finished turn**, and what it
can offer the user when a turn fails because the context window is full. No app code
was modified in this pass.

---

## 1. Headline finding: the engine already returns every signal we need

The audit raised this as an open question — whether our engine surfaces
`context_full` / `truncated` / `interrupted`, or whether we would have to string-match
the native throw the way PocketPal does. **It does. All of it, already, with timings.**

`llama.rn@0.13.0-rc.5`, `node_modules/llama.rn/lib/typescript/types.d.ts:443-485`:

```ts
export type NativeCompletionResult = {
  …
  truncated: boolean;            // :472
  stopped_eos: boolean;          // :473
  stopped_word: string;          // :474
  stopped_limit: number;         // :475
  stopping_word: string;         // :476
  context_full: boolean;         // :477   ← G1, no string-match required
  interrupted: boolean;          // :478   ← G4
  tokens_cached: number;         // :479
  timings: NativeCompletionResultTimings; // :480  ← G4
  …
};
```

`NativeCompletionResultTimings` (`:432-442`):

```ts
{ cache_n, prompt_n, prompt_ms, prompt_per_token_ms, prompt_per_second,
  predicted_n, predicted_ms, predicted_per_token_ms, predicted_per_second }
```

So `context_full` is a first-class boolean, `interrupted` distinguishes a stopped turn
from a finished one, and `prompt_ms` / `predicted_per_second` give TTFT and tokens/s
directly — no client-side clock arithmetic.

**We are dropping all of it on the floor.** `lib/inference/local-engine.ts:30-37`:

```ts
/** Structural slice of a llama.rn completion result we actually read. */
export interface LlamaCompletionResult {
  text?: string;
  content?: string;
  reasoning_content?: string;
  tool_calls?: LlamaTokenData["tool_calls"];
  tokens_predicted?: number;
  tokens_evaluated?: number;
}
```

This is a *structural* slice: TypeScript accepts it because every field we declare is
optional, so the real native result — which carries fourteen more fields — satisfies it
and the undeclared ones are simply never read. Nothing is lost in transit; the fields were
never asked for.

And the proof the omission is a bug rather than a choice: `local-engine.ts:172` hardcodes

```ts
stoppedEarly: false,
```

on every single completion. `CompletionOutcome.stoppedEarly` (`lib/inference/engine.ts:38`)
has been a constant `false` for the life of the field.

**Consequence for effort:** G1, G2 and G4 are one interface widening plus one sheet plus one
dependency. The audit ranked G1 as the single most important gap on the screen; it is
cheaper than it looked.

---

## 2. The one place that changes

Widen the slice, project the signals, and let the existing per-turn store carry them.

```
lib/inference/local-engine.ts:30-37   LlamaCompletionResult  ← widen to the native shape
lib/inference/local-engine.ts:172     stoppedEarly: false    ← project result.stopped_limit > 0
lib/inference/engine.ts:31-39         CompletionOutcome       ← add contextFull, interrupted, timings
lib/inference/remote-engine.ts:84      CompletionOutcome       ← same fields, from the HTTP finish_reason
lib/agent/runner.ts                    AgentResult             ← surface them per turn
types/chat.ts                          assistant turn          ← persist them with the turn
components/chat/MessageListItem.tsx    footer                  ← render them
```

`remote-engine.ts` must be changed in the same commit or the seam lies: `CompletionOutcome`
is the shared contract, and a remote model hitting its context limit has exactly the same
user problem as a local one. OpenAI's `finish_reason: "length"` is the equivalent signal
(`pocketpal-ai/src/api/openai.ts:998` maps it to `stopped_limit = 1`; the same mapping is
already written at `pocketpal-ai/src/api/completionEngines.ts:43-45`).

**Do not** reproduce PocketPal's string-match on the native `"Context is full"` throw
(`pocketpal-ai/src/hooks/useChatSession.ts:765`). Their own comment labels it
`LLAMARN-DEP`. We have the boolean.

### Test that must exist first

`tests/local-engine.test.ts` already fakes `ctx.completion`. One case asserting
`context_full` and `interrupted` survive the projection, and that `stoppedEarly` is no
longer constant — before any UI work. Without it there is nothing proving the seam works.

---

## 3. G1 — Context-full detection and recovery

### What PocketPal does

| Step | Citation |
|---|---|
| Freeze a `contextFull` snapshot on every finished turn: `result.context_full \|\| result.truncated \|\| (remote && stopped_limit === 1)` | `useChatSession.ts:244-262`, `:426-462` |
| String-match the native overflow throw as an equivalent | `useChatSession.ts:765-766` (skipped — see §2) |
| Sticky banner above the composer: fill meter, `%`, "More room", "New chat", "Dismiss" | `ChatView.tsx:1145-1151` → `BannerRow.tsx:66-240` |
| Variant escalation after ≥2 consecutive full failures | `utils/bannerVariantResolver.ts` |
| `IncreaseContextSheet`: ladder slider over `CONTEXT_LADDER` capped at the GGUF's trained length, showing ≈words, RAM estimate, a fits/tight/won't-fit chip, and the furthest fitting stop; reloads and rolls back on failure | `IncreaseContextSheet.tsx:36-330`, `fitStatus.ts:15-45`, gated at `ChatView.tsx:299-331` |

### What we have to build

**A.** `contextFull: boolean` on the assistant turn, persisted beside the text so the
banner survives an app restart. `lib/chat/tinybase-store.ts` already round-trips optional
fields on assistant turns (`:165`, `:194`) and there is a `reasoning` precedent at
`tests/tinybase-store.test.ts:38-47`.

**B.** Fill percentage. We already have both operands:
`CompletionOutcome.promptTokens` (`tokens_evaluated`, `local-engine.ts:220`) and
`store/inference.ts:35` `nCtx`. `fill = promptTokens / nCtx`. No new data needed.

**C.** A banner slot above the composer. `app/(drawer)/(tabs)/chat.tsx:388-398` is the
overlay row that currently holds only `SuggestedPrompts` and `UsageStats`. **It is out of
flow and positioned over the list** — see the comment block at `:379-386` and the reasoning
recorded in `docs/specs/2026-09-27-pocketpal-keyboard-ui-parity.md` §12. So a banner placed
there reserves nothing and cannot make the list reflow, which is exactly the property we
want. It must not go inside `MessageInput`: an in-flow row there is counted by the measured
composer height and would reflow the list every time it appeared.

**D.** The sheet: a ladder of context sizes above the current one, each labelled with the
RAM it needs and whether it plausibly fits.

### Recovery is cheaper than it looks

The audit flagged this as unverified ("does `n_ctx` reload mid-session actually work for
us?"). **It does, and it needs no new code.** `EngineManager.ensure()`
(`lib/inference/manager.ts:63-97`) keys the single slot on
`local:${fileName}:${initKey(init)}`, and `initKey` includes `init.n_ctx`
(`manager.ts:28-33`). `store/chat/index.ts:122` already builds `n_ctx` from
`params.nCtx`. So changing `nCtx` changes the key, and the next `ensure()` transparently
releases the old context and reloads at the new size (`manager.ts:78-82`).

The whole "More room" path is therefore: `setNContext(n)` → next send → automatic reload.
**Skip the explicit release/reload/rollback machinery PocketPal needs.** If a reload fails
it surfaces through the existing error path, which is honest and adequate.

### Fit-status honesty — DECIDED: no fit chip in V1

> **Correction (2026-09-29).** An earlier draft of this section claimed
> `lib/models/memoryEstimator.ts` "is already wired into context init". **That was wrong,
> and the error came from the audit report, which asserted the same thing.** Verified:
>
> - `estimateModelMemory` (`:134`) returns a **raw byte count**. There is no
>   fits/tight/won't-fit verdict anywhere in the file, and it never reads device RAM.
> - `ggufMetadata` is "never populated" per its own comment, so it always takes the
>   fallback `(size + proj + draft) * 1.2` (`:166`).
> - It has **exactly one caller**: `components/models/ModelCardDetails.tsx:91`, a model
>   card. Nothing on the chat or context-init path calls it.
> - Their `largestSuccessfulLoad` calibration has no analogue. Our
>   `store/models/types.ts:86 largestSuccessfulBytes` records the largest **download**
>   (`store/models/downloads.ts:202-203`), never a context length.

**Decision: ship the ladder with RAM estimates only, no verdict chip.** A chip backed by
a flat 1.2x multiplier over never-populated metadata is a confident-looking lie, and it
is precisely the thing that costs trust when the model OOMs anyway.

Populating `ggufMetadata` and building a real verdict is legitimate work — it just belongs
in the model-metadata path, not smuggled in under a chat feature. Tracked separately.

> **Superseded (2026-10-06).** The 2026-10-06 chat-message-ui-parity work did exactly that
> separate work, so the blocker named above no longer holds: the GGUF header is read at
> download/import time (`lib/models/gguf-metadata.ts`, `maxContextLength`), the KV-cache
> math reads real metadata so the estimate moves with `n_ctx`
> (`lib/models/memoryEstimator.ts`), and `lib/models/context-fit.ts` classifies a candidate
> size as fits / tight / won't-fit against device RAM and a calibrated ceiling. The
> context ladder sheet (ticket 07) therefore does ship the verdict chip, per stop, for
> this device. This note records the supersession; the reasoning above is left as it was
> written.
>
> One line above still stands on its own merits: changing `nCtx` alone reloads on the
> NEXT send. The ladder reloads at once so a size the device cannot load is discovered
> while the user is still in the sheet, and rolls the size back and re-initialises if
> that load fails.

### Non-goals

- Context **summarisation / compaction**. Neither app does it. Out of scope.
- Per-message context trimming. Out of scope.
- The `BannerRow` "heavy-talent" variant (`BannerRow.tsx:33-45`) — pal-coupled, excluded.

---

## 4. G2 — Keep-awake during generation — **SHIPPED 2026-09-29**

PocketPal holds the screen awake from send until the run finishes, and **deliberately
releases early on Stop** (`utils/keepAwake.ts:5-19`, armed at `useChatSession.ts:557-561`,
released at `:893-897` and `:928-934`). We never take a lock: `expo-keep-awake` appears
only transitively in `package-lock.json:4250`, never in `package.json`, and is imported
nowhere.

**Dependency, needs approval per `AGENTS.md`:** `expo-keep-awake`. First-party Expo, tiny,
and already resolved in the lockfile transitively, so it needs no rebuild — but it is not
currently a direct dependency and the policy is explicit. **Ask before adding.**

Two arms, three call sites: acquire when a send/retry/regenerate starts, release when the
run settles, and release **immediately** on Stop rather than waiting for the native
`stopCompletion()` to resolve — otherwise the screen sleeps during the teardown the user
just asked for.

Note this composes with G1: the banner is the thing that appears when the user has been
staring at a screen for a long time, and it should not dim.

### What landed

`expo-keep-awake ~57.0.2` added to `package.json` (approved) and to the lockfile's root
dependency mirror — the resolved `node_modules/expo-keep-awake` entry was already present at
57.0.2 with integrity, so only the root mirror needed it. No reinstall was required.

- `lib/chat/keep-awake.ts` — `holdScreen()` / `releaseScreen()` over a tagged
  `activateKeepAwakeAsync` / `deactivateKeepAwake`. The import is **dynamic**: the module
  sits in the chat store's dependency graph, which plain-Node tests import, and
  `expo-keep-awake` is native with no JS-only fallback. `releaseScreen` is synchronous so
  `stop()` can drop the lock without awaiting a possibly in-flight import.
- `store/chat/types.ts` — one new injectable dep, `keepAwake?: (on: boolean) => void`,
  matching the existing `ChatDeps` idiom (`getStore`, `runTurn`, …) so the seam is
  testable with no native module.
- `store/chat/send.ts` — armed once at the top of `runLocal`, which **every** path funnels
  through (send, retry, regenerate), released at the two exits that clear `sending`, plus
  an early release in `stop()`.
- `tests/chat-keep-awake.test.ts` — 5 cases, plain Node.

The subtle case, and the reason the test file exists: **a stopped run must not release the
lock the next turn just took.** `stop()` bumps `streamGen`, so the old run's unwind hits the
`gen !== ctx.streamGen` guard and returns before reaching its release. That guard is load
bearing — deleting it silently reintroduces a stuck-awake bug.

---

## 5. G4 — Turn observability (nearly free, same edit)

`CompletionOutcome` currently carries only token counts, which is why
`components/chat/MessageListItem.tsx:148` and `components/chat/MessageActions.tsx:72-75`
render `"{n} tokens"` and `"{p} in · {c} out"` — the same number twice. Once
`NativeCompletionResult.timings` is projected, the footer can carry:

| Row | Source field | PocketPal equivalent |
|---|---|---|
| TTFT | `timings.prompt_ms` | `AssistantTurnFooter.tsx:56-128` |
| Tokens/s | `timings.predicted_per_second` | same |
| ms/token | `timings.predicted_per_token_ms` | same |
| Interrupted | `interrupted` | `:120-128` |

The **"Interrupted" marker is the one that matters most** and costs one boolean. Today
`store/chat/send.ts:139-155` stops, keeps the partial text, stamps `at`, and clears
`sending` — so a stopped reply and a finished one are visually identical. That is the bug
users will actually hit.

PocketPal also renders a distinct **"Cut off"** label for truncation and suppresses both
markers while the context-full banner owns the turn (`:38-46`). Same rule here: the banner
says "context full", the footer saying "cut off" underneath it is noise.

**Speculative-draft acceptance** (`draft accepted X/Y (Z%)`) is **skipped** — it depends on
the speculative-decoding path, which is not in scope for this spec and which the audit did
not verify we run.

---

## 6. Sequencing

Ordered by dependency, not by impact. Steps 1–2 are the whole of G1's detection half and
should land as one reviewable commit with their test.

| # | Change | Gaps closed | Depends on |
|---|---|---|---|
| 1 | Widen `LlamaCompletionResult`; project `context_full`, `truncated`, `stopped_limit`, `interrupted`, `timings`; make `stoppedEarly` real. Test first. | G1 (detect), G4 (half) | — |
| 2 | Same fields on `remote-engine.ts` from `finish_reason`. Same commit as 1 — the seam must not lie. | G1 (remote) | 1 |
| 3 | Persist the flags on the assistant turn; project through `AgentResult`. | G1, G4 | 1, 2 |
| 4 | Assistant turn footer: Interrupted / Cut off + the three timing rows. | G4 | 3 |
| 5 | Banner slot in the overlay row + fill meter + "More room" / "New chat" / "Dismiss". | G1 (surface) | 3 |
| 6 | Context ladder sheet → `setNContext`. **No manager changes needed** (§3). | G1 (recover) | 5 + dep approval for the fit chip |
| 7 | Keep-awake arms/release/stop-release. | G2 | dep approval |

**G2 is independent of everything above** and could land alone in a day, given the
dependency approval.

---

## 7. Risks

- **`stoppedEarly: false` has been load-bearing?** Nothing reads it today, but it must be
  grepped before step 1 — if something depends on it always being `false`, step 1 is not a
  pure widening.
- **The widening is load-bearing on llama.rn's shape.** Our slice was written against
  `0.13.0-rc.5`; `stopped_limit` / `context_full` are read from an rc release. Re-verify
  against the actual installed `.d.ts` on the build machine, and consider a runtime
  `typeof` guard rather than a hard dependency — `context_full` absent must degrade to
  "no banner", not crash.
- **The QvAC migration is NOT pending — it was reverted.** An earlier draft of this
  section listed "ADR-0011 is Accepted but unimplemented" as a risk, implying the engine
  seam was about to churn. Wrong, and understating the good news. `git log --all` shows
  branch `spike/qvac-adapter`: `8801294 feat!: QVAC replaces llama.rn` →
  `e97af21 revert!: drop QVAC spike, restore llama.rn`. The adapter, proof screen and
  dependency were all removed; `local-engine.ts` was restored. **llama.rn is the engine
  and there is no second implementation coming.** The fields below only need writing once.
  ADR-0011 is corrected to match.
- **The banner is over the list, not in it.** Any future refactor that moves the overlay
  row into the composer's flow reintroduces the "no models available section moves when the
  keyboard shows up" bug documented at `chat.tsx:96-102`. The existing test guard in
  `tests/keyboard-avoidance.test.ts` should be extended to cover the banner slot.

---

## 8. Not copying from PocketPal

- The `"Context is full"` string-match (`useChatSession.ts:765`) — we have the boolean.
- The explicit release → set `n_ctx` → re-init → **roll back on failure** sequence
  (`IncreaseContextSheet.tsx`). `EngineManager` already reloads on an init-key change.
- The `BannerRow` remote-hedged and heavy-talent copy variants (`:211-218`).
- Speculative-draft acceptance (depends on a path we have not verified we run).

---

## 9. Open questions

1. Does `AgentRunner` (`lib/agent/runner.ts`) need its own per-step flags, or is the
   assistant turn the only place these belong? Multi-tool turns may want to distinguish
   "context full on step 2" from "step 1 was fine".
2. Should the banner persist across app restarts, or clear on launch? PocketPal keys it off
   the persisted snapshot, so it survives; a stale "context full" banner on a fresh launch
   is noise. **Recommend clear on launch.**
3. Is the fit chip honest enough to ship (§3)? Depends on `lib/models/memoryEstimator.ts`
   verification, which this pass did not do.
3. Is the remote path's `finish_reason: "length"` reliable, and does it mean
   context-full or `n_predict`? If the latter, the banner would lie on servers with a
   max-tokens cap. **Unverified.**
4. The banner's RAM estimate has no verdict behind it (see §3 above) — what number is
   honest to show when `estimateModelMemory` is never called on this path?