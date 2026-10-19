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
   separately); Pip seeds with **all five talents** in her pact so the default
   experience keeps tools under per-companion gating.
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
  tool support): deferred — the runner already rejects unadvertised calls
  and surfaces them as failed steps, so nothing breaks without it.
- Per-session thinking/effort overrides ride the same session-override cell
  as the sampler (absorbed from the earlier per-session override work);
  they layer over the per-model/global resolvers, sampler-first.

## 5. Not verified

No device run; behavior parity is argued from source, and kotlin/native is
untouched. Tests mirror the contracts in `services/companions/__tests__/` and
`store/__tests__/companions-store.test.ts`.
