# PocketPal persistence fact-check (post 10-27 inventory)

Date: 2026-10-31
Scope: re-verify `2026-10-27-pocketpal-persistence-inventory.md` against
current code. That doc's verdict was "no missing persistence" for shared
features, with three open deltas and a few "deliberately absent" fields.
Four days later several of those are already closed — this file records the
closures with file:line evidence, updates the mapping table, and re-states
what remains PocketPal-only.

## 1. The three 10-27 deltas — all closed

### 1a. `wasAutoReleased` / `lastAutoReleasedModelId` → persisted

The 10-27 doc: in-memory `releasedHere`, restart loses the restore hint.

Now: `autoReleasedModelId: string | null` on `InferenceParams`
(`store/inference.ts:82-87`; null IS "nothing was auto-released").
- It rides the standard `partialize` -> PARAM_KEYS list
  (`store/inference.ts:248-274`), so every settings save round-trips it.
- `setAutoReleasedModelId` additionally writes the blob immediately
  (`store/inference.ts:375-386`) so the record lands on disk BEFORE the
  caller frees the engine — the PocketPal reason for persisting it
  (eager reload after a restart, not just same-session restore) now holds.

One field instead of PocketPal's two (`wasAutoReleased` +
`lastAutoReleasedModelId`): the null id carries the "nothing" case.

### 1b. `toolCompatWarnedModels` → persisted

The 10-27 doc: deferred with the companion×model talent warning.

Now: part of the consolidated `liai_models` blob.
- Key def: `store/models/storage.ts:20` (`liai_tool_compat_warned`, legacy
  on-disk name kept for the read-once migration).
- Persisted slice includes it: `store/models/persist-shape.ts:100`,
  field on `ModelStateSource` (`persist-shape.ts:55`).
- Parse side: `parseWarnedModelIds` (`store/models/warnings.ts`), consumed
  by `store/models/persistence.ts:244` during migration and by the blob's
  merge cascade in `store/models/index.ts`.
- Suite: `store/models/__tests__/warnings.test.ts`.

### 1c. `pendingProjectionCleanupIds` → persisted

The 10-27 doc: vision-heal not ported, nothing to queue.

Now: LiAI HAS the heal, and the queue persists.
- Key def: `store/models/storage.ts:19` (`liai_pending_projection_cleanup`).
- Persisted slice: `store/models/persist-shape.ts:101`.
- Parse side: `parseProjectionCleanupQueue` (`store/models/vision-heal.ts`),
  drained at hydrate (`store/models/persistence.ts:328-333`).
- Suite: `store/models/__tests__/vision-heal.test.ts`.

## 2. Other 10-27 rows that moved since the inventory

| 10-27 verdict | Now | Evidence |
|---|---|---|
| `TTSStore.supertonicSteps/Language` deliberately absent (no sherpa seam) | **Persisted** in `liai_voice` | `store/voice.ts:676-682` partialize carries `supertonicSteps`, `supertonicLanguage` |
| Voice-mode override unpersisted (no hands-free) | **Persisted**: `userVoiceModeOverride` in `liai_asr` | `store/asr.ts:420-425` |
| `liai_onboarded` once-only flag | Renamed/replaced: `liai_onboarding`, legacy key read once | `services/onboarding.ts:13-17`; store: `store/onboarding.ts:52-56,82` |
| Per-field legacy keys (`liai_active_model`, `liai_remote_apis`, …) listed as live keys | **Legacy**: read once, consolidated into `liai_models`, never written again | `store/models/persistence.ts:42-52` (LEGACY_KEYS), `store/models/index.ts` persist name |
| — | `searchFilters` (HF author + sort) now inside the blob, not a standalone key | `store/models/persist-shape.ts:57,102`; legacy `liai_hf_search_filters` in LEGACY_KEYS |

`UIStore.colorScheme`'s `liai.theme` counterpart (added just before the
10-27 doc) stands as described there: `services/storage/theme.ts:17-50` —
explicit light/dark, OS scheme snapshotted once on first launch.

## 3. Updated mapping table (supersedes 10-27 §5)

Shared features only; deltas from 10-27 in bold.

| PocketPal field | LiAI counterpart | Where |
|---|---|---|
| `ModelStore.useAutoRelease` | `autoOffload` | `liai_inference` |
| `ModelStore.contextInitParams` | raw settings, derived at startup | `liai_inference` |
| `ModelStore.lastUsedModelId` | `activeModelId` | inside `liai_models` (legacy `liai_active_model` read-once) |
| `ModelStore.largestSuccessfulLoad` | `largestSuccessfulBytes` | inside `liai_models` (legacy `liai_memory_guard`) |
| `ModelStore.wasAutoReleased` + `lastAutoReleasedModelId` | **`autoReleasedModelId`** (single field, null = nothing) | `liai_inference` |
| `ModelStore.toolCompatWarnedModels` | **`toolCompatWarnedModels`** | inside `liai_models` |
| `ModelStore.pendingProjectionCleanupIds` | **`pendingProjectionCleanup`** | inside `liai_models` |
| `ServerStore.privacyNoticeAcknowledged` | `privacyAcknowledged` | inside `liai_models` (legacy `liai_remote_caps` payload) |
| `ServerStore.remoteReasoning` | `ModelSpec.reasoning` + `thinkingOverrides`/`effortOverrides` | `liai_models` catalog + `liai_inference` overrides |
| `ServerStore.userSelectedModels` | remote specs in catalog (`addRemoteApi` → `addModel`) | `liai_models` |
| `UIStore.pageStates.modelsScreen` + `autoNavigatetoChat` | `expandedGroups`, filters, `autoNavigateToChat` | `liai_models_ui` |
| `UIStore.toolCompatWarnedModels` | same field as ModelStore's (PocketPal keeps it on UIStore, LiAI keeps it next to the catalog) | inside `liai_models` |
| `TTSStore` full field set incl. supertonic steps/language | **full parity** | `liai_voice` |
| `VoiceModeStore.userVoiceModeOverride` | **`userVoiceModeOverride`** | `liai_asr` |
| `ASRStore` (override, tier, language) | `userASROverride`, `selectedTier`, `spokenLanguage` | `liai_asr` |
| `HFStore.useHfToken` | `useHfToken` in blob (legacy `liai_hf_token_use`); token in SecureStore | inside `liai_models` |
| `hasCompletedOnboarding` | `liai_onboarding` (legacy `liai_onboarded` read-once) | AsyncStorage |
| `deviceTier`/`rulesVersion`/`availableMemoryCeiling` | computed at startup from `assets/device-tiers.json` (deliberate, 2026-10-18 doc §1); only the USER tier override persists | `liai_asr.selectedTier` |
| HF search filters (`HFStore`/search sheet) | **`searchFilters` inside the blob** (legacy standalone key read-once) | inside `liai_models` |

Verdict stands, strengthened: **no missing persistence among shared
features.** Nothing in PocketPal's storage that maps to a feature LiAI
ships is un-round-tripped.

## 4. Still PocketPal-only (not gaps)

Unchanged from 10-27 §4, re-confirmed against LiAI's tree today:

- **PalsHub trio** — `cached_pals` / `user_library` / `sync_status`
  (+ `AuthService` profile, Supabase session on AsyncStorage). LiAI ships
  no marketplace/backend; the companion side is served by TinyBase
  `companions` (2026-10-18 spec); hub/price/rating columns intentionally
  not ported.
- **`purchase-ledger`** (IAP) — no store billing in LiAI.
- **`BenchmarkStore`** — LiAI has no benchmark runner.
- **`@pocketpal_ai/app_feedback_id`** — no feedback flow.
- **`UIStore._language`** — English-only; revisit only if a settings
  screen asks for a language picker.
- **`UIStore.displayMemUsage` / `benchmarkShareDialog` /
  `onboardingTopicsSnapshot`** — screens LiAI does not have.
- **`VoiceModeStore.unlockOverride`** — an `__E2E__`-only persistence
  branch in PocketPal (`src/store/VoiceModeStore.ts`), not a product field.
- **`PalStore` legacy JSON** — migrated into WatermelonDB inside
  PocketPal itself; nothing to mirror.
- **`e2e.fakeStore` / `e2e.plusShip`** — PocketPal's E2E test scaffolding.

## 5. Method note

Every "closed" claim above was read out of the current working tree
(2026-10-31), not inferred from changelogs. PocketPal's side was sampled
only where the inventory cited it; the vendored copy is pinned, so its
key list is assumed stable since 10-27.

Companion docs:
- `2026-10-27-pocketpal-persistence-inventory.md` — the itemized inventory
  this file fact-checks.
- `2026-10-18-store-db-companions-parity.md` — layer architecture and the
  companions design.
