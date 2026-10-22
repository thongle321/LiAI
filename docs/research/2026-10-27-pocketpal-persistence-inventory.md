# PocketPal persistence inventory vs LiAI

Date: 2026-10-27
Scope: what PocketPal actually writes to disk, key by key, and how it maps
onto LiAI. Companion to `2026-10-18-store-db-companions-parity.md` §1 (which
covers the layer architecture); this file is the itemized inventory.

## 1. PocketPal: four storage surfaces

### 1a. AsyncStorage — mobx-persist-store blobs (one key per store)

| Key | Contents |
|---|---|
| `ModelStore` | Full `Model[]` JSON (downloaded flags, chat templates, stop words, completion settings, hf metadata), `version`, `deviceTier`, `rulesVersion`, `useAutoRelease`, `contextInitParams`, `lastUsedModelId`, `wasAutoReleased`, `lastAutoReleasedModelId`, `availableMemoryCeiling`, `largestSuccessfulLoad`, `pendingProjectionCleanupIds` |
| `ServerStore` | `servers[]` (url, type, timeout), `privacyNoticeAcknowledged`, `userSelectedModels[]`, `remoteReasoning`, `remoteCaps` |
| `TTSStore` | `autoSpeakEnabled`, `currentVoice`, `supertonicSteps`, `supertonicLanguage`, `userTTSOverride` |
| `UIStore` | `pageStates` (per-screen UI, incl. models filters/expanded groups), `colorScheme`, `autoNavigatetoChat`, `displayMemUsage`, `benchmarkShareDialog`, `_language`, `toolCompatWarnedModels`, `hasCompletedOnboarding`, `onboardingTopicsSnapshot` |
| `SearchProviderStore` | `activeProviderId`, `resultCount`, `hasConsentedToSearch` (keys themselves are Keychain — see 1c) |
| `HFStore` | `useHfToken` flag only (token itself is Keychain) |
| `BenchmarkStore` | `results` (benchmark runs) |
| `AuthService` | `profile` only — Supabase owns the session |

### 1b. AsyncStorage — manually written keys

| Key | Contents |
|---|---|
| `purchase-ledger` | `{version: 1, records}` IAP ledger |
| `@pocketpal_ai/app_feedback_id` | anonymous feedback uuid |
| `PalStore.builtin.Lookie.seeded` / `PalStore.builtin.Pip.seeded` | once-only seeding flags |
| `PalStore` | legacy JSON pals — **read once, migrated to WatermelonDB, then removed** |
| Supabase auth session | via `supabase.ts` `auth.storage = AsyncStorage` |

### 1c. Keychain (react-native-keychain)

| Service | Contents |
|---|---|
| `pocketpal-server-<serverId>` | per-server API key |
| `hf_token_service` | HuggingFace token |
| `search_provider_service_<providerId>` | per-provider search API key |

### 1d. WatermelonDB (SQLite, schema v8)

- `chat_sessions` — title, date, `active_pal_id`, `settings_source`, pinned
- `messages` — session_id, author, text, type, `metadata` (JSON: tool calls,
  talent results, tokens…), position
- `completion_settings` — per-session sampler snapshot (full snapshot, not
  partial)
- `global_settings` — key/value JSON (global completion settings)
- `local_pals` — name, system prompt + original/changed flags, `default_model`
  (JSON), color pair, capabilities, `parameters` + `parameter_schema`,
  `generation_settings`, `pact` (talents), `greeting`, plus PalsHub metadata
  columns (description, thumbnail, creator, price, rating…)
- `cached_pals`, `user_library`, `sync_status` — PalsHub/Supabase/IAP sync

## 2. LiAI: three storage surfaces

### 2a. AsyncStorage (`liai_*` keys, explicit parse+validate per key)

| Key | Contents |
|---|---|
| `liai_models` | model catalog, remote-API models saved with `apiKey` **scrubbed** |
| `liai_active_model` | active model id |
| `liai_remote_apis` | remote provider configs, re-persisted scrubbed |
| `liai_model_settings` | per-model settings |
| `liai_hf_search_filters` | HF search author + sort |
| `liai_remote_caps` | probed remote capabilities |
| `liai_memory_guard` | `largestSuccessfulBytes` |
| `liai_hf_token_use` | attach-token flag (token itself is SecureStore) |
| `liai_hf_token_v1` | legacy plaintext token — read once, migrated to SecureStore, **deleted** |
| `liai_inference` | context init params (nCtx, gpuLayers, threads, mmap/mlock, flashAttn, caches), speculative decoding, thinking/effort overrides, sampler |
| `liai_voice` | `currentVoice`, `autoSpeak`, `userTTSOverride` |
| `liai_search` | `activeProviderId`, `resultCount`, `hasConsented` |
| `liai_watch` | vision watch interval |
| `liai_models_ui` | expanded groups, filters, autoNavigateToChat |
| `liai.theme` | explicit `light` / `dark` appearance — snapshotted from the OS on first launch, then never follows it (legacy `system` migrates on read) |
| `liai_onboarded`, `liai_companions_pip_seeded` | once-only flags |

### 2b. SecureStore (expo-secure-store)

`liai_hf_token`, `liai_provider_key_<providerId>`, `liai_search_key_<providerId>`
— written via namespaced builders in `services/auth/secrets.ts`; blanks wipe.

### 2c. TinyBase + expo-sqlite (`liai-chat.db`)

`sessions`, `messages` (usage, timings, blocks, toolRuns), `toolRuns`,
`drafts` (per-session, incl. `__new_chat__` slot), `sessionSampler` (partial
per-session override JSON), `companions`, `Values` (activeSessionId, seq).

## 3. Mapping verdict

| Concern | PocketPal | LiAI | Verdict |
|---|---|---|---|
| Pref blobs | mobx-persist-store per store | explicit key + defensive parser | At parity; ours validates at read, theirs needs post-hydration normalize (e.g. `SearchProviderStore.normalizeHydratedPrefs`) |
| Model catalog | `ModelStore` blob incl. `deviceTier`/`rulesVersion` | `liai_models` + separate settings/caps keys | At parity; we deliberately compute tier at startup instead of persisting it |
| Secrets | Keychain (server keys, HF, search) | SecureStore (provider, HF, search) | At parity; ours additionally migrates + deletes the legacy plaintext key |
| Chat history | WatermelonDB `messages` + `completion_settings` | TinyBase `messages`/`toolRuns`/`drafts`/`sessionSampler` | LiAI stores more (tokens, timings, blocks, tool runs) |
| Companions/pals | `local_pals` (JSON-in-columns) | TinyBase `companions` table | Covered by the 2026-10-18 spec; hub/sync/IAP columns intentionally not ported |
| Drafts | implicit (new-chat session row) | explicit `drafts` table | LiAI is cleaner |
| Seeding flags | `PalStore.builtin.*.seeded` | `liai_companions_pip_seeded` | At parity |
| TTS prefs | `TTSStore` blob | `liai_voice` | At parity (same three fields + engine extras) |

## 4. PocketPal-only (not ported — not gaps)

- `purchase-ledger` (IAP), `@pocketpal_ai/app_feedback_id`, `BenchmarkStore` —
  features LiAI doesn't have.
- Supabase session + `AuthService.profile` — no auth backend in LiAI.
- `cached_pals` / `user_library` / `sync_status` — PalsHub sync.
- `UIStore._language` — LiAI has no persisted language (English-only); add
  only if a settings screen asks for one. `UIStore.colorScheme` now has a
  counterpart: `liai.theme` stores an explicit light/dark choice (first
  launch snapshots the OS scheme, then the app never follows the OS), matching
  PocketPal's behaviour.

## 5. Feature-matched gap scan (shared features only)

Method: for every PocketPal persisted field belonging to a feature LiAI has,
confirmed a persisted counterpart. Excluded PocketPal-only features (IAP,
benchmarks, feedback id, Supabase, PalsHub, language picker,
`displayMemUsage`, onboarding-topics snapshot — LiAI has no such screen).

**Verdict: no missing persistence.** Every shared feature round-trips:

| PocketPal field | LiAI counterpart | Where |
|---|---|---|
| `ModelStore.useAutoRelease` | `autoOffload` | `liai_inference` |
| `ModelStore.contextInitParams` | raw settings, derived at startup | `liai_inference` |
| `ModelStore.lastUsedModelId` | `activeModelId` | `liai_active_model` |
| `ModelStore.largestSuccessfulLoad` | `largestSuccessfulBytes` | `liai_memory_guard` |
| `ServerStore.privacyNoticeAcknowledged` | `privacyAcknowledged` | inside `liai_remote_caps` payload |
| `ServerStore.remoteReasoning` | `ModelSpec.reasoning` + `thinkingOverrides`/`effortOverrides` (catalog persists with `liai_models`; overrides with `liai_inference`) | two keys instead of one store |
| `ServerStore.userSelectedModels` | remote spec added to catalog (`addRemoteApi` → `addModel`) | `liai_models` |
| `UIStore.pageStates.modelsScreen` + `autoNavigatetoChat` | `expandedGroups`, filters, `autoNavigateToChat` | `liai_models_ui` |
| `TTSStore.supertonicSteps/Language` | deliberately absent — sherpa exposes no seam (`services/tts/engines/supertonic.ts:9`) | n/a |
| `HFStore.useHfToken` | `HF_TOKEN_USE_KEY` flag; token in SecureStore | `liai_hf_token_use` |
| `hasCompletedOnboarding` | `liai_onboarded` | ✓ |
| `deviceTier`/`rulesVersion`/`availableMemoryCeiling` | computed at startup (deliberate: 2026-10-18 doc §1) | n/a |

Three remaining deltas, none a bug:

1. **`wasAutoReleased` / `lastAutoReleasedModelId`** (persisted by PocketPal,
   in-memory `releasedHere` in LiAI `services/inference/offload.ts:65`).
   Same-session background→foreground restore works identically in both;
   persistence only adds an eager reload after an app *restart*. LiAI's next
   send loads the model instead. Optional to add, correctness unaffected.
2. **`toolCompatWarnedModels`** (per-model once-only warning set) — the
   companion×model talent warning is a deferred feature (2026-10-18 doc §4),
   so there is nothing to persist yet. When it is built, it needs a persisted
   warned-set; this is the one item to remember.
3. **`pendingProjectionCleanupIds`** — belongs to PocketPal's vision-heal
   (`healDraftVisionClassification`), which LiAI has not ported; nothing to
   clean means nothing to queue. Revisit if draft-only detection is added.
