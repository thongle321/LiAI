# Combined Architecture Refactor Plan

LiAI mobile &middot; derived from `architecture-review-2026-10-19.html` (12 deepening candidates).
Scope: plan only. No code changes in this document. Execution happens after the user switches out of Plan mode.

## 0. Ground rules

- Vocabulary from `/codebase-design`: module, interface, implementation, depth, seam, adapter, leverage, locality. Use these, not "service/component/boundary".
- One candidate = one module deepening. Do not bundle unrelated changes into a single PR.
- Each phase ends with `npm run typecheck` and `npm test` green before the next phase starts.
- Existing tests are the contract: a deepening must keep them green or update them only where the interface genuinely changed (and then the update is part of the candidate, reviewed).
- No new libraries. All collaborators already exist (`zustand`, `tinybase`, `expo-sqlite`).
- Dynamic `import()` calls keep relative paths (jest CJS constraint); static imports use `@/`.

## 1. Dependency order of phases

```
Phase 1  Chat core (SessionStore port, turn resolvers, TurnDeps, leakage)
   |
   v
Phase 2  Download subsystem (global callbacks, DownloadDriver seam)
   |
   v
Phase 3  Voice / TTS (voice store split, engine-card controller, oneshot/download)
   |
   v
Phase 4  Model catalog (HuggingFace split)
   |
   v
Phase 5  UI composition (chat route, pure-function locality)
```

Phase 1 first: it shrinks the fake surface every other candidate depends on (a smaller SessionStore port makes download/voice fakes cheaper too). Phase 2 before Phase 3 because the download driver seam is reused by the voice download controller in Phase 3. Phase 4 is independent but lower leverage. Phase 5 last: it is cleanup that only pays off once the modules it composes are deep.

## 2. Phase 1 — Chat core

### 1.1 Candidate: Collapse the SessionStore port (Strong)

**Module:** `SessionStore` (port) + `TinyBaseSessionStore` (sole adapter).

**Current interface:** ~30 methods spanning catalog, turns, drafts, active pointer, companion binding, settings source/override, duplication, truncation, deletion. Implementation is a 1:1 mapping over TinyBase cells.

**Target interface:** four focused ports (or, equivalently, four capability objects on one store):

- `SessionCatalog`: `listSessions`, `getSession`, `createSession`, `renameSession`, `deleteSession`, `duplicateSession`, `setActive`, `getActive`.
- `TurnWriter`: `appendTurn`, `listTurns`, `truncateFrom`, `popLastTurn`, `getTurnCount`.
- `DraftStore`: `getDraft`, `setDraft`, `clearDraft`.
- `SessionSettings`: `getCompanion`, `setCompanion`, `getSettingsSource`, `setSettingsSource`, `getOverride`, `setOverride`.

**Seam:** the port files under `services/chat/`. One adapter (`TinyBaseSessionStore`) satisfies all four. Tests use one in-memory adapter implementing all four, or four smaller fakes.

**Implementation plan:**

1. Define the four interfaces in `services/chat/session-store.ts`, replacing the single `SessionStore` interface. Keep a composite `SessionStore = SessionCatalog & TurnWriter & DraftStore & SessionSettings` for callers that need all four, so call sites compile unchanged during migration.
2. Update `TinyBaseSessionStore` to implement each interface (no logic change, just type conformance).
3. Migrate callers in `store/chat/*` to depend on the narrowest port they use (e.g. `send.ts` only needs `TurnWriter` + `SessionSettings`).
4. Shrink `tinybase-store.test.ts` (949 lines) by splitting into four test files, one per port, sharing a `makeStore()` fixture.
5. Remove the composite export once no caller imports it (grep for `SessionStore`).

**Tests:** each port gets its own `__tests__` file; the in-memory fake implements only the ports a test needs.

**Acceptance:** `npm test` green; no caller imports the 30-method composite; test file count for session store goes from 1 to 4, each under ~300 lines.

### 1.2 Candidate: Consolidate turn-input resolvers (Strong)

**Module:** new `resolveTurnInputs(sessionId)` in `services/chat/turn.ts` (or a new `services/chat/turn-context.ts`).

**Current interface:** ~15 `default*` functions in `store/chat/index.ts`, each a thin async pass-through with its own try/catch and dynamic import. No single owner of "what a turn sees".

**Target interface:**

```ts
interface TurnInputs {
  engineSource: EngineSource | null;
  store: SessionStore | null;
  search: SearchAuth | null;
  systemPrompt: string | undefined;
  talentNames: string[];
  thinking: boolean | undefined;
  effort: EffortLevel | undefined;
  jinja: boolean;
  sampler: SamplerParams | null;
  stopWords: string[];
  chatTemplate: string;
  addGenerationPrompt: boolean | undefined;
}
async function resolveTurnInputs(sessionId: string | null): Promise<TurnInputs>;
```

**Implementation plan:**

1. Move all `default*` resolver bodies into `resolveTurnInputs`, preserving the exact precedence and try/catch semantics (each field independently falls back; do not collapse into one try/catch that wipes all fields on one failure).
2. Keep `defaultRunTurn` calling `resolveTurnInputs` once per turn and passing the result into `createTurnRunner` via the existing deps (or a new `getTurnInputs` dep).
3. Delete the `default*` functions from `store/chat/index.ts`; keep `defaultGetStore` exported (used by Generation settings sheet) but have it delegate to the tinybase service.
4. Add unit tests for `resolveTurnInputs` with fake stores/inference/search, covering partial-failure fallback.

**Acceptance:** `store/chat/index.ts` drops from ~593 lines to ~200; new test file `services/chat/__tests__/turn-context.test.ts` covers fallback semantics.

### 1.3 Candidate: Group the TurnDeps interface (Worth exploring)

**Module:** `TurnDeps` in `services/chat/turn.ts`.

**Current interface:** ~25 flat optional methods.

**Target interface:** four groups:

```ts
interface EngineDeps { ensureEngine; getEngineSource; }
interface StoreDeps { getStore; }
interface PromptDeps { getSystemPrompt; getTalentNames; getThinking; getEffort; getSampler; getStopWords; getChatTemplate; getAddGenerationPrompt; getJinja; }
interface MediaDeps { resolveImage; /* toDataUris, removeImages if used */ }
interface TurnDeps { engine: EngineDeps; store: StoreDeps; prompt: PromptDeps; media: MediaDeps; }
```

**Implementation plan:**

1. Define the four groups; keep a deprecated flat `TurnDeps` alias that assembles the groups, so `defaultRunTurn` can migrate incrementally.
2. Update `createTurnRunner` to read `deps.engine.*`, `deps.store.*`, etc.
3. Update `defaultRunTurn` to build the grouped object.
4. Migrate tests that construct `TurnDeps` (search `TurnDeps` usages).

**Acceptance:** no test constructs more than 4 top-level deps; `createTurnRunner` body unchanged in behavior.

### 1.4 Candidate: Stop store slices leaking into the UI (Worth exploring)

**Module:** move two exports to their service homes.

- `multimodalAvailable` (`store/chat/send.ts:32`) -> `services/inference/mmproj.ts` (it already owns `loadModelState`/`canSeeImages`).
- `defaultGetStore` (`store/chat/index.ts:81`) -> `services/chat/tinybase.ts` (exported accessor).

**Implementation plan:**

1. Add `multimodalAvailable` to `mmproj.ts` with the same signature; update `send.ts` to import from there (or remove from send slice entirely).
2. Add `getSessionStore()` (or rename) to `tinybase.ts`; update `store/chat/index.ts` to re-export for backward compat, then remove re-export once callers updated.
3. Update consumers: `components/vision/*`, `components/chat/generation-settings-sheet.tsx`.
4. Remove the store-side exports.

**Acceptance:** no `components/` file imports from `store/chat/*` except state hooks (`useChatStore`); grep confirms.

## 3. Phase 2 — Download subsystem

### 2.1 Candidate: Replace global download callbacks (Strong)

**Module:** `download-service.ts` (job lifecycle) + `store/models/downloads.ts` (state application).

**Current interface:** module-global `setProgressCallback`/`setCompleteCallback` registered per download; last-writer-wins.

**Target interface:** per-job subscribers keyed by job id inside `download-service.ts`:

```ts
subscribe(jobId, (update: DownloadJobUpdate) => void): () => void;
```

Store applies updates via a single `applyDownloadUpdate(modelId, update)`.

**Implementation plan:**

1. Add a subscriber registry to `download-service.ts` (Map<jobId, Set<callback>>) with `subscribe`/`unsubscribe` and automatic cleanup on terminal state.
2. Change `startSpecDownload` to register the store's callback through `subscribe(jobId, ...)`, not a global setter.
3. Remove `setProgressCallback`/`setCompleteCallback` from the store slice; replace with `applyDownloadUpdate`.
4. Add a test that starts two downloads and asserts each receives only its own progress.

**Acceptance:** new test `downloads.concurrent.test.ts` passes; no global callback setters remain.

### 2.2 Candidate: Make the download driver an explicit seam (Worth exploring)

**Module:** `DownloadDriver` interface (new) in `services/downloads/`.

**Current interface:** implicit native seam; JS orchestration only testable on device.

**Target interface:**

```ts
interface DownloadDriver {
  start(job: DownloadJobSpec, onProgress: (p: number) => void): Promise<string>; // returns local path
  pause(jobId: string): Promise<void>;
  resume(jobId: string, onProgress): Promise<string>;
  cancel(jobId: string): Promise<void>;
  remove(path: string): Promise<void>;
  incomplete(): Promise<Record<string, number>>;
}
```

**Implementation plan:**

1. Define `DownloadDriver` in `services/downloads/driver.ts`.
2. Implement `NativeDownloadDriver` wrapping the current WorkManager/disk/space calls (moved out of `download-service.ts`).
3. Implement `FakeDownloadDriver` in `jest/fixtures/` for tests.
4. Inject the driver into `download-service.ts` and `store/models/downloads.ts` via constructor/parameter (default to native in app, fake in tests).
5. Add contract tests in `services/downloads/__tests__/driver-contract.test.ts` exercising start/pause/resume/cancel/complete against the fake.

**Acceptance:** JS download transitions testable in Node; Kotlin seam unchanged (still device-verified per AGENTS.md).

## 4. Phase 3 — Voice / TTS

### 3.1 Candidate: Split the voice store's orchestration (Worth exploring)

**Module:** `VoiceState` (state) + `VoiceEngineService` (play/stop) + `VoiceDownloadController` (download lifecycle).

**Current interface:** `VoiceState` ~40 members mixing state, play, download, reconcile.

**Target interface:**

- `VoiceState`: persisted state (`currentVoice`, `autoSpeak`, `userTTSOverride`), runtime state (`playbackState`, `lastSpokenMessageId`, `pendingVoiceRestore`, `downloads`, `activeEngineId`, `deviceMeetsMemory`, `loaded`), `load`, `isTTSAvailable`, setters, `markSpoken`/`clearSpoken`, `reconcile` (pure, already extracted).
- `VoiceEngineService`: `play(text, voice, opts)`, `stop()`, `isInstalled(engine)`.
- `VoiceDownloadController`: `start`, `pause`, `resume`, `remove` per engine, delegating to `ttsDownloads` and calling back into `VoiceState.applyEngineStatus`.

**Implementation plan:**

1. Extract `VoiceEngineService` wrapping `getEngine`/`ttsRuntime`/`engine.isInstalled` (currently inline in `play()`). Store's `play` becomes a delegation.
2. Extract `VoiceDownloadController` wrapping the download start/pause/resume/remove flow; store holds `applyEngineStatus` as the status sink.
3. Keep `reconcileVoice`/`restoreVoice` as pure functions (already extracted and tested).
4. Update `useVoice` singleton wiring.

**Acceptance:** `play()` logic testable with a fake engine; store tests shrink to state + persistence + reconcile.

### 3.2 Candidate: Extract the engine-card controller (Worth exploring)

**Module:** `useEngineCardController(engineId)` hook in `components/voice/` (or `hooks/`).

**Current interface:** component owns `previewingId`, `errorNote`, `expanded`, `track`, `onTapVoice`, `onRemove`, `renderAction`.

**Target interface:** hook returns render-ready state + handlers; component is pure view.

**Implementation plan:**

1. Create `hooks/useEngineCardController.ts` (or `components/voice/use-engine-card-controller.ts`) owning preview lifecycle, error-note tracking, remove confirmation, disk preflight wiring.
2. Delegate decisions to existing `services/tts/voiceUi.ts` pure rules (unchanged).
3. Rewrite `engine-card.tsx` to consume the hook.
4. Add `components/voice/__tests__/engine-card-controller.test.tsx` covering preview start/stop, remove flow, error note.

**Acceptance:** controller transitions tested without rendering; `engine-card.tsx` under ~150 lines.

### 3.3 Candidate: Split the TTS oneshot and download state machines (Speculative)

**Module:** `speakOnce` stages + `DownloadController` for the TTS download bridge.

**Current interface:** `speakOnce` (233 lines, interleaved) + `createTtsDownloadBridge` (271 lines, 4 closure fields, 8 methods).

**Target interface:**

- `speakOnce` orchestrates `createEngine` -> `startPlayer` -> `runGeneration` -> `teardown`, each a function with explicit inputs/outputs.
- TTS download bridge state extracted into a `DownloadController` class with explicit transitions (idle/downloading/paused/ready/error), tested independently of the native loader.

**Implementation plan:**

1. Refactor `speakOnce` into four named functions in `oneshot.ts`, keeping the public signature.
2. Extract bridge state into `services/tts/download-controller.ts`; bridge delegates.
3. Add tests for abort/cancel/pause/resume transitions against fakes.

**Acceptance:** abort and pause paths covered by tests; public `speakOnce` signature unchanged.

## 5. Phase 4 — Model catalog

### 4.1 Candidate: Split the HuggingFace grab-bag (Worth exploring)

**Module:** split `services/models/huggingface.ts` (740 lines) into three:

- `constants/presets.ts`: `PRESETS` array + preset metadata (data only, no imports).
- `services/models/hf-search.ts`: `searchModels`, `getModelFiles`, HTTP/retry.
- `services/models/spec-builders.ts`: `buildHfModelSpec`, `buildPresetModelSpec`, `hfDownloadUrl`, `isHuggingFaceUrl`, `hfSpecId`, `presetSpecId`.

**Implementation plan:**

1. Move `PRESETS` to `constants/presets.ts`; update imports.
2. Move search/HTTP to `hf-search.ts`; move spec builders to `spec-builders.ts`.
3. Keep `huggingface.ts` as a thin barrel re-exporting all three for backward compat, then remove barrel once callers updated (grep usages).
4. Split tests: preset data tests in `constants/__tests__/presets.test.ts`; retry tests in `hf-search.test.ts`; spec tests in `spec-builders.test.ts`.

**Acceptance:** no module imports network code when it only needs preset data; `huggingface.ts` either deleted or under ~30 lines (barrel only).

## 6. Phase 5 — UI composition

### 5.1 Candidate: Thin out the chat route (Speculative)

**Module:** `app/(drawer)/(tabs)/chat.tsx` route.

**Current interface:** route owns state collection, session loading, health checks, JSX.

**Target interface:** route is pure composition of `useChatSessionLoader`, `useChatHealth`, `useChatBanner`, and view components.

**Implementation plan:**

1. Extract `hooks/useChatSessionLoader.ts` (session load + active pointer adoption).
2. Extract `hooks/useChatHealth.ts` (health check + connection state).
3. Route becomes a declarative shell.
4. Move hydration gating to root layout (per D3-1) if not already.

**Acceptance:** route under ~80 lines; hooks tested in isolation.

### 5.2 Candidate: Colocate pure functions with their callers (Worth exploring)

**Module:** five sites where a tested pure function's caller is untested:

- `reconcileVoice` (`store/voice.ts:171`) with its caller in the same file (already colocated — verify the caller passes the right slice).
- `cardActions`/`statusDotState` (`services/models/card-actions.ts:35`) with card rendering callers.
- `voiceTap` (`services/tts/voiceUi.ts:117`) with engine-card caller.
- `blocksOf`/`turnText`/`sanitizeBlocks` (`services/chat/blocks.ts:26`) with message rendering callers.
- `multimodalAvailable` (`store/chat/send.ts:32`) — resolved by Phase 1.4.

**Implementation plan:** for each, either (a) colocate function + caller in the same module so tests can hit the real path, or (b) change the function's signature to accept the caller's native data shape, eliminating the reshaping adapter. Prefer (b) where the reshape is the bug risk.

**Acceptance:** each site has a test exercising the caller's data shape, not just the pure function.

## 7. Cross-cutting acceptance criteria

- `npm run typecheck` and `npm test` green after each phase.
- No new major libraries.
- Architecture-conventions test (`jest/architecture-conventions.test.ts`) stays green (kebab-case files, tests in `__tests__/`, no `../../` imports, utils pure).
- Dynamic `import()` calls retain relative paths.
- ADRs: if a phase contradicts an existing ADR, surface it before starting. Currently no ADRs exist in `docs/adr/`; consider recording one ADR per phase capturing the deepening decision, so future reviews do not re-suggest it.

## 8. Top recommendation

Start with **Phase 1.1 (Collapse the SessionStore port)**. It is the widest interface, the deepest implementation gap, and the chat feature is the app's core; every subsequent phase's fakes get cheaper once the session seam is narrow.

## 9. Out of scope

- Kotlin/native code (`modules/`, `android/`) — unreachable from `npm test`; changes there remain device-verified only.
- PocketPal parity work measured against `pocketpal-ai/` — separate track; this plan only addresses module depth, not feature parity.
- UI visual changes — no styling changes; refactors must be behavior-preserving.