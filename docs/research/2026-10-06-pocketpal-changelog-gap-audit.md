# PocketPal changelog audit → LiAI gaps (C-series)

**Date:** 2026-10-06
**Reference:** `pocketpal-ai/` at `v1.19.1` (HEAD `937c9bc0`), read-only checkout.
**Source of truth:** the GitHub Releases changelog for `a-ghorbani/pocketpal-ai`,
`v1.15.1` → `v1.19.1`.
**Scope:** the whole visible changelog, filtered to features LiAI actually has.

> **Why `C` and not `G`.** `G1`–`G17` belong to
> `2026-09-29-pocketpal-chat-feature-audit.md`, which covered the **chat screen
> only**. This sweep covers the whole app, so a `C` prefix is used to make it
> impossible to read "C7" and assume it is that document's "G7".
>
> **The previous audit recorded no PocketPal baseline commit.** It cannot be
> used to say which of these were already considered. This document therefore
> re-derives each item from the current `v1.19.1` source rather than assuming.

---

## 1. Considered and NOT a gap (already shipped, differently)

The filter earned its keep here: four changelog features would have been paid
for twice.

| Change | LiAI's state |
| --- | --- |
| **#780** keyboard keeps latest output visible | **Ahead of PocketPal.** `MessageList.tsx:38-45` uses 24/40px STICK/LEAVE hysteresis to stop the jump pill flapping; `:168-173` pins `maintainVisibleContentPosition` while streaming; `:117-140` uses `KeyboardChatScrollView`. PocketPal's actual fix — platform-scoped `keyboardDismissMode` — is present at `:138`. |
| **#805** speculative decoding / MTP | Present and complete. `InferenceSettings.tsx:304-341`, init params at `store/chat/index.ts:133-143`, and the draft cache already feeds `estimateModelMemory`. |
| **#771** cancel shows "Download Failed" | Fixed twice, with comments. `downloads.ts:206` and `download-service.ts:390-398`. |
| **#834** markdown link colour theme-aware | Already themed via `colors.primary` (`MarkdownView.tsx:75`). |
| **#747** onboarding splash + stack | Present (3 steps vs their 6 — a design choice, not a gap). |

---

## 2. Gaps

### C1 — Download failure reason is never shown
**Found by this sweep; not a changelog item.** Adjacent to #771.

`store/models/downloads.ts:144,211,222` write error strings such as
*"Not enough storage space to download the model"*. `DownloadButton` renders
only the word "Retry" (`ModelBits.tsx:152`). Nothing in `components/models/`
reads `spec.error` (`types/models.ts:48`).

**The data is already collected and discarded.** Cheapest real win in the set.

### C2 — Markdown links are inert
No `link()` override on the renderer (`MarkdownView.tsx:20-27`), so `Linking`
is never invoked. A rendered URL does nothing. The only link-opening surfaces
are web-search hits (`toolSurfaces.tsx:155`) and `LinkPreview.tsx:41`.

Larger user-visible impact than #834, which asked only about colour.

### C3 — Cached/reused prompt tokens are uncounted — `#894`
`tokens_cached` (native) and `cache_n` (timings) are never read on either
engine. The project's own spec admits it: *"We are dropping all of it on the
floor"* (`docs/specs/2026-09-29-chat-turn-signals-and-lifecycle.md:30,36-37`).
Remote `usage.prompt_tokens_details.cached_tokens` likewise unread.

PocketPal: `servers/index.ts:334-345` — `tokensEvaluated = (prompt_n ?? 0) +
(cache_n ?? 0)`, each key guarded independently because "old build omits
`cache_n`" and "cold prompt reports `0`" are different facts.

**Consequence:** the context meter divides by `nCtx` using an under-reported
occupancy (`context-fill.ts:19-22`), so a thread near the window limit can show
a comfortable percentage. Compounds C4.

### C4 — No proactive near-limit warning — `#763`
Recovery is fully built: `ContextLadderSheet` (`ContextFullBanner.tsx:87-160`),
`setNCtx`, engine reload (`manager.ts:29-46`). The **warning is post-hoc only** —
`chat.tsx:220-227` keys off `outcome.contextFull === true`, i.e. it appears
after a turn has already failed. Nothing thresholds `fillPercent`.

PocketPal warns at 80% (`bannerVariantResolver.ts:3`) with a 256-token runway.

### C5 — Remote server timeout is not configurable — `#778`
`remote-engine.ts:22,94-95` already has the right mechanism (`AbortController`
+ `setTimeout`, cleared in `finally`). `DEFAULT_TIMEOUT_MS = 120_000` is a
hardcoded constant, never surfaced; `store/chat/index.ts:152` passes no
`timeoutMs`.

**Note for whoever ports this:** PocketPal's implementation is XHR-based
(`openai.ts:503-524` connection timer + per-chunk idle timer). LiAI uses
`fetch` + `AbortController`, so the *port is unnecessary* — this is a UI +
persistence gap, not a networking one.

### C6 — Thinking is global, not per-model — `#783`
`store/inference.ts:49` — `thinkingEnabled` is one boolean, default `true`.
`local-engine.ts:147,154-155` sends `reasoning_format: "auto"` and
`enable_thinking` unconditionally, so **a non-reasoning model still receives
`enable_thinking: true`**. `ModelSpec.capabilities` (`types/models.ts:51`) is a
free-form `string[]` that nothing derives reasoning from.

PocketPal resolves capability on two axes with provenance
`user > learned > detected > unknown` (`reasoningCapability.ts:70-103`).

### C7 — No remote capability probe — `#818`, `#830`
`RemoteCaps` has exactly two fields, `reachable` and `checkedAt`
(`types/models.ts:131-134`). No `/props` request, so no vision detection and
no context-length discovery.

**Already causing a defect:** `remote-engine.ts:135-139` cannot distinguish a
full context window from a server-side `max_tokens`, and therefore refuses to
claim the context is full. That is a direct product of the missing probe.

### C8 — Camera hardware feature not optional — `#893` — **SHIPPED (`f763758`)**
`plugins/withOptionalCameraHardware.js`. Done as a config plugin because
`/android/` is gitignored and regenerated by prebuild.

### C9 — Tier presets can silently vanish — `#925`
`AvailableModels.tsx:252` renders **only** `tier.presetIds`. All 18 presets are
currently covered, but a new catalog entry without a tier row disappears with
no error. No per-model `min_app_version` gate exists
(`ModelStore` equivalent absent; `ModelSpec` has no version field).

Tier matching itself is solid and **not** a gap: `device-tiers.ts:16-53`,
including the MiB-not-decimal-MB note.

### C10 — Absolute `localPath` is persisted — `#835` — *latent*
Inference is safe — `resolveLocalFile` re-derives from the live
`documentDirectory` at call time (`engine.ts:131-138`). But
`downloads.ts:123,194` writes an absolute container path that
`model-upgrade.ts:86` re-hydrates and **nothing ever reads**. The same field
holds a *relative* path for imported models (`local-model.ts:30`), so the field
carries two conventions.

**Not a live bug — a trap for the next feature that trusts it.**

### C11–C17 — from the chat-screen divergence sweep
Found by comparing the two chat screens feature-for-feature in the reverse
direction (LiAI → PocketPal), which no prior audit had done. Full evidence in
`2026-10-06-pocketpal-chat-divergence.md` §2; every absence was verified by
search rather than inferred.

### C11 — Session list has no date grouping
`SessionList.tsx` handles pinning but has no grouping. PocketPal groups into
Today / Yesterday / This week / … with pinned sessions hoisted into a leading
group (`SidebarContent.tsx:315`, `ChatSessionStore.ts:1194`).

### C12 — No multi-select, bulk delete, or bulk export
Confirmed absent. PocketPal: `SidebarContent.tsx:186,427,458`. A real workflow
gap, not a nicety.

### C13 — Markdown tables are not rendered
`ChatRenderer` overrides only `code()` (`MarkdownView.tsx:20`), so there is no
table handling. PocketPal ships `TableRenderers.tsx` wired into both the
content and reasoning providers. Any model output containing a table renders
poorly. **Most likely of the seven to be seen by a user.**

### C14 — No `render_html` talent or HTML preview
Confirmed absent; four talents only (`datetime`, `calculate`, `web_search`,
`read_url`). PocketPal renders model HTML in a strict-CSP WebView
(`HtmlPreviewBubble.tsx:46`). Previously out-of-scope in the G5 spec as a
WebView dependency — recorded here so the decision is revisited knowingly.

### C15 — No per-tool metrics footer
Confirmed absent. PocketPal: `ToolMetricsFooter.tsx:28` renders
`1,500 tokens · 35s` under a tool result. Timing already lives in LiAI's turn
footer, so this is a placement question rather than missing data.

### C16 — No macrotask yield during streaming
Confirmed absent. PocketPal yields every 100ms (`useChatSession.ts:722`) so
touch events — notably Stop — dispatch during long streams. Without it, a long
stream may keep the JS thread busy enough to delay the Stop press.

### C17 — No lazy message hydration
Confirmed absent; every session switch reads all turns. PocketPal loads
metadata only and hydrates on open (`ChatSessionStore.ts:271,406`). A
performance gap that grows with conversation length.

---

## 3. Behaviour changes — decide individually

### B1 — `providerType` never changes the request — *deliberate, retained*
**Decision: leave as-is.** Recorded here so it is not mistaken for a gap.

LiAI collects and persists `providerType: "openrouter" | "custom_openai"`
(`RemoteModelSheet.tsx:35,54`) and the Add-from-API sheet is deliberately
simpler than PocketPal's (2 types / 4 fields vs their 6+ with per-type config).

Verified: the request body at `remote-engine.ts:104-109` is exactly
`{ model, messages, tools? }`. `provider.providerType` is never referenced
anywhere in the engine, so OpenRouter and Custom OpenAI are byte-identical on
the wire. Samplers are typed `Local-only` with a written rationale
(`engine.ts:82-90`), and `manager.ts:80` keys the slot on
`remote:${provider.id}` with no `providerType`.

**Known consequence:** the user's chosen temperature does not reach any remote
model, and OpenRouter's `reasoning` / `provider` routing fields are discarded.

Revisit only if users are visibly confused by that.

### B2 — Remote `contextFull` semantics — *deliberate, retained*
LiAI reports `contextFull: false` even on `finish_reason: "length"`
(`remote-engine.ts:133-143`) and reports `stoppedEarly` instead. PocketPal
treats `stopped_limit === 1` as full. The LiAI choice is well-reasoned — a
false "context full" banner is worse than none — but it means the banner never
fires on remote. Interacts with C7.

### B3 — Context ladder fit estimates — *blocked*
PocketPal classifies each rung fits / tight / won't-fit
(`fitStatus.ts:17-30`) and gates the CTA on `hasFittingUpgrade`. LiAI's
`ContextLadderSheet.tsx:87-94` documents that it shows sizes only, because
`ggufMetadata` is never populated. Requires populating GGUF metadata first.

---

## 4. Excluded, with reasons

| Excluded | Why |
| --- | --- |
| Pals, pal cards, pal downloads, default-pal preservation (#923, #920) | Out of scope by standing decision |
| Voice / TTS, Supertonic synthesis | Out of scope by standing decision |
| PalsHub, in-app purchase, sign-in, US buy sheet (#938, #953, #766, #752, #757) | Needs a backend; ADR-0012 records LiAI as local-only |
| **All translation / locale work** — Swedish, German, Spanish, Polish, pt-PT, pt-BR, searchable language picker, locale registry | **LiAI has no i18n**: no `locales/`, no translation files. ~12 changelog lines |
| llama.rn 0.12.4→0.13.0-rc.5, onnxruntime-android pin (#928, #924, #873, #901) | Dependency changes, not features |
| Benchmark matrix via devicectl (#939), e2e/spec repairs, payload tripwires (#902), Hexagon session selection (#907) | Dev/CI tooling |
| `NSLocalNetworkUsageDescription` (#820) | iOS local-network prompt; no local-network server in LiAI |
| Remove sponsorship link from About (#909) | Not present in LiAI |

### Flagged, not gaps — possible manifest residue
`SYSTEM_ALERT_WINDOW` plus `READ/WRITE_EXTERNAL_STORAGE` (maxSdk 32,
`tools:replace`) in `AndroidManifest.xml:4,6,8` read as debug/build residue
rather than product requirements. **Not changed** — removing permissions is a
distribution decision, not a parity one. Raised for a decision.

---

## 5. Open questions carried forward

1. `docs/research/2026-09-29-pocketpal-chat-feature-audit.md` records **no
   PocketPal baseline commit**. Adding one would make future parity work
   decidable instead of re-derived.
2. `AvailableModels.tsx:252` has no coverage check that every catalog preset
   appears in some tier (C9).
3. The nav-bar overlap in `components/Sheet.tsx` remains **unverified** —
   `insets.bottom` is non-zero and correctly reported (47.87 on a 3-button
   device) and applied to both body branches, but whether that clears the bar
   has not been confirmed on hardware. See `29e2c65`.
