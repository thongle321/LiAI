# PocketParity: auto-release, vision heal, talent warning

Date: 2026-10-19
Scope: the three remaining persistence deltas from
`2026-10-27-pocketpal-persistence-inventory.md` §5, ported. Each section
records what PocketPal does, what LiAI does, and where the two differ on
purpose.

Reference: `pocketpal-ai/` (read-only, vendored).

## 1. Persist the auto-release and warm the model on the next launch

**PocketPal.** `ModelStore` keeps `wasAutoReleased` +
`lastAutoReleasedModelId` (persisted, `ModelStore.ts:284-300`).
`markAutoReleased` (`:1127`) records the model when the app releases its
context to the background; `checkAndReloadAutoReleasedModel` (`:1148`) runs
at the end of `initializeStore` (`:850`) and loads the model again if the
flag is set; `clearAutoReleaseFlags` (`:1140`) resets both.

**LiAI.** `services/inference/offload.ts` already released the engine when
the app went to the background, but the fact lived in a closure
(`releasedHere`), so a restart started cold. Now:

- `store/inference.ts` carries `autoReleasedModelId: string | null` in the
  persisted `liai_inference` payload. A null id IS "nothing was
  auto-released", so LiAI keeps one field where PocketPal keeps two flags.
- `services/inference/auto-release.ts` owns the rules. The decision is a
  pure function (`decideAutoRelease`); the effectful wrappers take their
  collaborators as parameters, so the rules are testable without the
  stores or a device.
- `hooks/useEngineOffload.ts` records the model before it frees the
  engine, and clears the record once the model is back.
- `app/index.tsx` awaits the warm-up before it hides the splash.

**Deliberate differences.**

1. *Bounded.* The warm-up holds the splash for at most
   `AUTO_RELEASE_RELOAD_TIMEOUT_MS` (120 s). PocketPal waits for the load
   however long it takes, which would hold the app closed forever on a
   model that never loads. The load is not cancelled on timeout — it keeps
   running, and the first message finds a warm engine if it got there in
   time.
2. *The record is bounded too.* `AUTO_RELEASE_RECORD_TIMEOUT_MS` (250 ms)
   caps the wait for the write, because the free is what keeps a
   multi-gigabyte model from being a memory problem in the background.
3. *Only the active model.* The engine holds ONE slot, keyed on the active
   model, so warming any other id would load the wrong file. PocketPal
   reloads whatever the flag names.
4. *A failed load keeps the flag.* PocketPal's `clearAutoReleaseFlags()`
   sits AFTER the load, so a throw skips it; ours does the same, and the
   next launch gets another try. A load that merely ran out of time clears
   the flag: the app opened without the model, and the next launch must not
   hold the splash for the same wait again.
5. *No `disableAutoRelease` reasons.* PocketPal parks the auto-release
   while the camera or the gallery is open (`ChatInput.tsx:277`). LiAI has
   no such bracket, so the single `autoOffload` preference is the whole
   rule.

## 2. The vision heal and the projection cleanup queue

**PocketPal.** `healDraftVisionClassification` (`:699`) re-derives the
vision classification of a model the pairing heuristic misfiled: a draft
repository carries an mmproj, so the model was classified as vision-capable
and the app downloaded a projector a draft can never use. The cleared
projector ids go into `pendingProjectionCleanupIds` (persisted), and
`drainPendingProjectionCleanup` (`:737`) deletes those files on the next
launch, after the download state is synced.

**LiAI.** `utils/draft-only.ts` holds the detection (the GGUF header is
authoritative; the filename decides only pre-download), and
`store/models/vision-heal.ts` holds the heal and the queue. The drain runs
in `store/models/persistence.ts` right after the catalog is hydrated and
the download state is synced — the same order PocketPal uses (`:772`).

**Deliberate differences.**

1. *The queue holds projector FILE NAMES, not model ids.* LiAI's
   projector is an inline record on the model (`ModelSpec.projector`), not
   a first-class model row, so there is no model id to point at.
2. *A projector paired with ANY model is never deleted.* Two LLMs of one
   repository can share one mmproj; deleting it would blind the model that
   still needs it. PocketPal only checks the DEFAULT pairing.
3. *`supportsVision: false` and `visionEnabled: false` are written
   EXPLICITLY.* `utils/model-upgrade.ts` re-infers `supportsVision` from
   "has a projector or is a vision row" when the field is absent, and
   `visionEnabled` means ON when absent. An absent value would be undone
   on the next launch and the model would claim vision again.
4. *The queue is written BEFORE the catalog.* A kill between the two
   writes would leave a file with no owner and no queue entry — never
   cleaned up again. With the queue first, the worst case is a queue entry
   whose model still has its pairing, and the next launch re-runs the heal.
5. *A header that cannot classify is not an invitation to guess.* When
   `ggufMetadata` is present but carries no architecture, the spec is
   NOT draft-only, even if the filename looks like one.

**Also ported: the creation-time rule.** `buildHfModelSpec`
(`services/models/spec-builders.ts`) now refuses to mark a draft in a
vision repo as vision-capable, exactly as PocketPal's `hfAsModel`
(`pocketpal-ai/src/utils/index.ts:430`) does with
`isVisionLLM = isVision && !isProjModel && !isDraftOnly`. Without this, a
newly bookmarked draft repo re-created the misclassification on every
launch until the heal ran.

## 3. The companion talent warning and the warned-set

**PocketPal.** `UIStore` keeps `toolCompatWarnedModels` (persisted,
`UIStore.ts:62`) and `ChatScreen.tsx:148` raises a warning when a
companion declares talents and the active model advertises no tool
support. The verdict comes from the live context:
`model.chatTemplates.jinja` — `defaultCaps.tools`, `defaultCaps.toolCalls`,
`toolUse`, `toolUseCaps` (`ChatScreen.tsx:174`).

**LiAI.**

- `services/inference/tool-support.ts` reads the same four places. It is
  three-valued, like `thinking-detection.ts`: a context with no model at
  all could not tell, and that is never written as "no tool support".
- `store/chat/index.ts` probes in the local loader, where the raw context
  is in hand — the `EngineManager` keeps only the `CompletionEngine` — and
  persists the verdict as `ModelSpec.supportsTools`, next to the existing
  thinking probe.
- `store/models/warnings.ts` owns the warned-set (`liai_tool_compat_warned`).
- `hooks/useToolCompatWarning.ts` raises the notice on the chat screen's
  existing `chatWarning` surface.

**Deliberate differences.**

1. *The warned-set lives in the model store.* LiAI has no `UIStore`; the
   model store already owns the persisted catalog, and it is the store that
   knows which model is active.
2. *The notice is not recoverable.* PocketPal's is
   `recoverable: true`; LiAI's snackbar renders a Retry button for a
   recoverable warning, and the chat screen always wires Retry to the
   last FAILED turn. A Retry on "this model cannot call tools" would be a
   lie.
3. *The notice is model-scoped.* LiAI's chat has ONE warning slot, and the
   session load clears it a tick after the screen mounts — so a
   turn-scoped notice would be wiped before it was ever read (and the model
   would already be marked as warned, so it would never come back). The
   warning therefore carries `scope: "model"`, and the conversation-reset
   sites keep it.
4. *The copy is PocketPal's exact wording*, as a plain constant — LiAI has
   no runtime i18n, like `MULTIMODAL_WARNING` in `store/chat/send.ts`.

## Not ported

- `isMTPCapable` / `nEmbdOut` / `probeRemoteMTPCapability`
  (`pocketpal-ai/src/utils/mtp.ts`): LiAI has no speculative-decoding
  draft resolution, so there is nothing to resolve.
- `autoReleaseDisabledReasons` and the camera/gallery brackets: see §1.5.
- `pendingProjectionCleanupIds` as a list of MODEL IDS: see §2.1.
