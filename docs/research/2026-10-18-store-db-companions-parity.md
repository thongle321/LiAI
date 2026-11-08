# Store/DB parity: PocketPal vs LiAI → Companions (local layer) implementation record

Date: 2026-10-18
Status: implementation of the LOCAL companions layer in progress (user-confirmed
shared understanding, §Decision record)
Supersedes the "minus pals" exclusion in `docs/specs/2026-09-24-pocketpal-parity.md`.

> **Renamed 2026-10-18.** The feature is called *companion*, not *pal*, so it
> carries LiAI's own naming rather than the reference app's. §2 below still
> uses PocketPal's names because it describes their code; everywhere else the
> names are ours. The on-disk names changed with it and there is no migration:
> the feature never shipped, so a stale install is cleared rather than
> converted.

## 1. Store/DB comparison (what PocketPal stores vs LiAI)

| Layer | PocketPal | LiAI |
|---|---|---|
| State | MobX singletons (13 stores), mobx-persist-store → AsyncStorage blobs | Zustand (chat/models slice barrels + standalone stores), factory-injectable |
| Structured data | WatermelonDB over SQLite, schema v8, explicit migrations | TinyBase + expo-sqlite (`liai-chat.db`), additive optional cells |
| Prefs | Per-store AsyncStorage blobs | `KeyValueStorage` seam, versioned `liai_*_v1/v2` keys |
| Secrets | react-native-keychain | expo-secure-store (+ scrub-on-save, legacy plaintext migration) |

At-parity already (nothing to copy): messages/sessions (LiAI stores more:
tokens, timings, blocks, toolRuns), onboarding flag (`services/onboarding.ts`),
voice/TTS (per-engine downloads + stash/restore), search prefs, HF-token-use
flag, memory guard (`largestSuccessfulBytes`), secrets, interrupted-download
reconcile, global chat defaults (inference store ≈ their `global_settings`).
`deviceTier`/`rulesVersion` persisting buys nothing on LiAI's compute-at-startup
approach. The one real gap found: per-session settings scope → absorbed into the
settings_source contract below.

## 2. Pals deep dive (PocketPal)

- **Pal type** (`pocketpal-ai/src/types/pal.ts`): identity, system prompt
  (+`originalSystemPrompt`/`isSystemPromptChanged`), `defaultModel` (full Model
  JSON), color gradient, capabilities, `parameters` + `parameterSchema`
  (Mustache-templated prompts), `completionSettings`, `pact.talents`
  (PACT = Pal Action & Capability Treaty), `greeting` (non-persisted bubble +
  suggested-prompt chips), hub metadata (skipped — hub not ported).
- **PalStore**: DB-backed (`local_pals`), once-only builtin seeding (Pip, Lookie)
  via AsyncStorage flag keys; `ready` promise gates consumers.
- **Chat linkage**: `chat_sessions.active_pal_id` + `settings_source`
  ('pal'|'custom'); precedence `session → pal → global`; custom replaces all
  but re-carries PACT-derived `tools`; session birth snapshots resolved
  settings + pal + source.
- **System prompt**: pal prompt (Mustache-rendered with parameters) → model
  chat-template prompt → none; folded with talent fragments into ONE leading
  system message.
- **Talents**: engine-object registry (`TalentEngine`: tool schema, execute,
  `systemPromptFragment`, `recommendedContextTokens`); five engines
  (datetime, calculate, web_search, read_url, render_html); per-pal allowlist
  enforced via derived tool schemas + runner rejection.
- **UI**: Pals library screen (grid, filter chips, add-pal templates), unified
  editor sheet, per-pal generation settings sheet, chat models/pals picker
  sheet, "Switch Model?" activation alert, ModelNotAvailable download CTA.

## 3. Decision record (grilling rounds, user answers)

1. Scope: local companions only, behavior-identical on LiAI's stack. **No PalsHub,
   no Supabase auth, no IAP** (they point at PocketPal's own backend/accounts).
2. Precedence: **session → companion → global** (PocketPal-exact; the earlier
   per-model middle layer was superseded once companions exist). The pending
   per-session sampler/thinking/effort override work is absorbed into the
   settings_source contract.
3. Storage: **TinyBase `companions` table in `liai-chat.db`** ("same like
   pocketpal-ai, but use my db library").
4. Builtins: **Pip only** (no video companion — voice feature already exists
   separately); Pip seeds with **no tools by default** (matching PocketPal's
   `initializePipPal`, which has no pact). Tools are opt-in per companion via
   the editor's Tools section (see `2026-11-01-companion-tools-gating.md`).
5. Editor: all fields **except AI prompt generation and thumbnail image**
   (`useAIPrompt`/`thumbnail_url` carried in the type, unused).
6. Talents: **full registry upgrade** — engine objects, per-companion gating,
   fragments, context hints (Q3=B).
7. UI: **both surfaces** — Companions screen (drawer entry) + chat-header picker.
8. **Export/import: local only** (share + document picker), JSON round-trip
   incl. `pact`.

## 4. Known deviations from "100% identical"

- Hub metadata fields, Supabase auth, IAP ledger, PalsHub sync: not ported.
- Video pal (Lookie) / video capability branch: not ported. No
  `expo-linear-gradient` was installed (dependency policy) — companion cards
  carry their color pair as an accent strip, not a gradient.
- Per-companion completionSettings cover SAMPLER knobs only (the editor's
  SamplerRows); thinking/effort stay a per-model/session concern.
- The staged (pre-birth) settings source is store state but the sheet
  only exposes the companion/custom toggle on a BORN session; the staged
  source always reads 'companion'.
- Per-session custom settings stay a PARTIAL sampler overlay (only fields the
  session changed are stored, so a new global preset still reaches it) —
  PocketPal stores a full snapshot. settings_source gating is identical.
- `usePalLoadHint` fires only for the local engine (remote providers report
  no `n_ctx`); the hint is deferred to a follow-up only if it proves noisy.
- Model-compat one-time warning (companion declares talents, model advertises no
  tool support): implemented after this record (hooks/useToolCompatWarning.ts).
  LiAI additionally WITHHOLDS the pact in that case while PocketPal only warns —
  see `2026-11-01-companion-tools-gating.md`.
- Per-session thinking/effort overrides ride the same session-override cell
  as the sampler (absorbed from the earlier per-session override work);
  they layer over the per-model/global resolvers, sampler-first.

## 5. Not verified

No device run; behavior parity is argued from source, and kotlin/native is
untouched. Tests mirror the contracts in `services/companions/__tests__/` and
`store/__tests__/companions-store.test.ts`.

## 6. Update 2026-11-03 — local-parity closeout

Four editor/chat divergences found by re-reading PocketPal's `PalSheet`,
`ChatView` and `ModelNotAvailable`, all fixed with tests at pure seams:

1. **Prompts-only greeting survives.** PocketPal keeps a greeting when
   `greetingText` OR `suggestedPrompts` is non-empty (`PalSheet.tsx:267-277`).
   LiAI used the text alone, so a companion with chips but no greeting text
   lost them on save. The draft→write mapping now lives in
   `services/companions/editor-draft.ts` and keeps either half.
2. **Chips render without greeting text.** PocketPal gates the bubble on
   `greeting.text` and the chips on `greeting.suggestedPrompts`
   independently (`ChatView.tsx:991,1270`). LiAI gated both on the text.
   `services/chat/greeting.ts` now resolves the two halves separately and the
   chat screen consumes them that way.
3. **Clearing a field works.** The repository treats `undefined` as
   "leave untouched" and `null` as "erase". The editor wrote `undefined` for
   "None" (model), a blank description, and the generation sheet's "follow
   preset" reset, so all three silently kept their stored value. Updates now
   send `null`; `ClearableCompanionField` (`types/companion.ts`) lists the
   four fields this covers.
4. **`ModelNotAvailable` ported to the editor.** A linked model that is not
   downloaded now shows its recommended name/size with a Download button
   (preset-resolvable), a progress line while downloading, or an honest
   "not in the catalog any more" note. Editing also preserves
   `capabilities` instead of resetting it to `{}` (PocketPal:
   `pal.capabilities || {}`).

Known limit, unchanged by this update: a companion stores a model **ref**
(`CompanionModelRef`), not PocketPal's full Model JSON, so only a model the
catalog still ships as a preset can be re-downloaded from the companion
surface. An HF-only ref whose spec was deleted degrades to the "unavailable"
note. Storing the full model would close that gap but changes the export
format; it remains a separate decision.

Seams added: `services/companions/__tests__/editor-draft.test.ts`,
`services/chat/__tests__/greeting.test.ts`,
`services/companions/__tests__/model-availability.test.ts`, plus two
`companion-editor-sheet` integration cases. Video remains excluded.

## 7. Update 2026-11-03 — Tier 1/2 UI parity closeout

Five remaining PocketPal `PalsScreen` / `PalSheet` / `DynamicParameters` / `AddPalMenu` gaps, all implemented test-first:

1. **Dynamic parameter rendering** (`services/companions/parameter-fields.ts` + `components/companions/dynamic-parameter-fields.tsx` + 6 tests). PocketPal's `DynamicParameterForm` dispatches four control types from `parameter.type`: `text` → `TextInput`, `select` → `Selector` (native picker), `combobox` → free-text input with filtered suggestions, `datetime_tag` → pressable inserting `{{datetime}}`. LiAI now renders all four; the pure rules live in `parameter-fields.ts` for node-testable normalisation / filtering / label logic, and the components use the shared `PickerMenu` (outlined variant) for `select` and an inline suggestion list for `combobox`. Replaces the editor's previous text-only parameter map.

2. **Talent descriptions in the Tools section** (`services/companions/talent-display.ts` + 4 tests). The editor's talent toggles now show a readable label (`datetime` → "Date & Time", `web_search` → "Web Search", …) and the tool definition's `function.description` instead of `name.replace("_"," ")`. Matches PocketPal's `TalentSection` which iterates the talent registry.

3. **AddPalMenu component** (`components/companions/add-pal-menu.tsx`). Replaces the `Alert.alert` template picker with an anchored Modal (same pattern as `chat-menu.tsx`) with `MenuRow` items for Assistant and Roleplay. No video template. Render-prop pattern keeps the trigger ref inside the menu so `measureInWindow` works without the caller managing it.

4. **Pull-to-refresh on the Companions screen**. Added `RefreshControl` to the `FlatList` with an `onRefresh` that calls `ensureCompanionsLoaded()`. Matches PocketPal's `onRefresh` on their `FlatList`/`ScrollView`.

5. **Design-system compliance**. Swapped ad-hoc `font-sans text-body-md text-primary-text` utilities for the shared roles `.text-body`, `.text-quiet`, `.text-action` (the `jest/design-system.test.ts` guard enforced this).

All suites green (141 suites / 1297 tests), `bun run typecheck` clean.

## 8. Update 2026-11-04 — Thumbnails, AI Prompt Generation, Active Row Settings closeout

Three more PocketPal `PalSheet` / `SquarePalCard` / `ChatPalModelPickerSheet` gaps closed:

1. **Thumbnails** (carried in type, now wired end-to-end):
   - Companion card already rendered `thumbnail_url` as an `Image` over the avatar.
   - Added `ThumbnailPicker` in the editor (image picker → base64 data URI).
   - Export: local `file://` thumbnails embedded as base64 `thumbnail_data`; remote URLs pass through as `thumbnail_url`.
   - Import: base64 `thumbnail_data` written to `Documents/companion-thumbnails/` and stored as `file://` URI.
   - Pure helpers in `services/companions/thumbnail.ts` + 8 tests; async `toCompanionsJson` / `parseCompanionsJson` in `companion-json.ts`.

2. **AI Prompt Generation** (checkbox + model selector + instructions + Generate button in System Prompt section):
   - Added `useAIPrompt`, `promptGenerationModel`, `generatingPrompt` to `Companion` type and `CompanionEditorDraft`.
   - Editor shows ToggleRow → when on: `ModelSelector` (outlined) for generation model, `CompanionTextRow` for instructions, `Pressable` Generate button (stubbed with Alert).
   - Matches PocketPal's `SystemPromptSection` conditional block.

3. **Active row settings gear in chat picker**:
   - `ChatPickerSheet` companion row now a `flex-row` with text left, `Settings` icon right (only on active row).
   - Press calls `onOpenEditor(companion)` → closes picker. Chat screen passes callback (stubbed; full integration needs editor sheet mounted in chat route).

All 142 suites / 1305 tests pass, `bun run typecheck` clean.

## 9. Update 2026-11-04 — AI Prompt Generation execution closeout

AI Prompt Generation now **fully implemented** (was stubbed in §8):

- **Engine support**: Added `responseFormat` to `CompletionRequest` in `services/inference/engine.ts`; both local (`local-engine.ts`) and remote (`remote-engine.ts`) engines pass it through as `response_format: { type: "json_schema", ... }`.
- **Structured output hook**: New `hooks/useStructuredOutput.ts` acquires the engine slot via `EngineManager.ensure()`, builds a `CompletionRequest` with `json_schema` (`strict: true`), and returns parsed JSON. Mirrors PocketPal's `useStructuredOutput`.
- **Editor wiring**: Generate button now calls `buildGenerationPrompt` → `generate()` → writes `systemPrompt` (and `originalSystemPrompt` if unset) + resets `isSystemPromptChanged`. Uses `SamplerParams` with low temperature (0.2) for deterministic output.
- **Schema**: `GENERATION_SCHEMA` in `services/companions/ai-prompt-generation.ts` constrains output to `{ prompt: string }` (matches PocketPal).
- **Tests**: 4 new tests in `services/companions/__tests__/ai-prompt-generation.test.ts` for prompt building and schema.

All 143 suites / 1309 tests pass, `bun run typecheck` clean.

## 10. Update 2026-11-04 — Active row settings gear: full editor handoff

The §8 gear is now wired at its only remaining stub. `ChatPickerSheet`'s
gear on the active companion row opens `CompanionEditorSheet` in place,
matching `app/(drawer)/companions.tsx`'s ownership rule: the route holds a
`Partial<Companion> | null` and the sheet is visible iff it is non-null —
no navigation, no second editor instance. The picker calls
`onOpenEditor(companion)` then closes itself; the chat route's handler is
`setEditingCompanion(companion)`. Edits/delete write through the companions
store, so the bound or staged companion updates with no re-activation.

Done test-first at the picker seam: three new cases in
`components/chat/__tests__/chat-picker-sheet.test.tsx` (gear on the active
row only, hidden when nothing is bound, press → hands the companion to
`onOpenEditor` and closes the sheet). Also brought the suite's stale
§8-adjacent comments in line: the gear IS the reference behavior now, so
the row-texture test no longer claims "management has no surface here".
The route wiring itself composes the two already-tested components and has
no chat route test to pin it — verified by `bun run typecheck` and the full
suite, the same standard companions.tsx wired its editor under.

All 143 suites / 1312 tests pass, `bun run typecheck` clean.
