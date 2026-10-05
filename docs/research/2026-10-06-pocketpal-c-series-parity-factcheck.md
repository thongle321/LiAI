# PocketPal C-series parity fact-check — 14 issues vs primary source

**Date:** 2026-10-06 (shell `Get-Date` — real date, not inferred).
**Method:** read every issue in `.scratch/pocketpal-c-series/issues/`, then read the
cited PocketPal file at the cited location and LiAI's current working-tree
implementation of the same feature. Classification per issue:
PARITY / DECIDED DIVERGENCE / UNDECLARED DIVERGENCE / CITATION STALE / PREMISE WRONG.
**Primary source = code only:** `pocketpal-ai/src/**` and LiAI's
`components/ lib/ store/ app/ tests/ types/`. `docs/research/*` used only as a
decision source (D-doc §3), never as evidence. Starting-state claims spot-checked
against `git show <sha>^:<path>` (git works in this environment). Every citation
below is the line actually read.

---

## 01 — Surface the download failure reason (C1) — **PREMISE WRONG**

**PocketPal side (verified):** a failed download's stored reason IS surfaced —
in a dialog, not on the button:
- error thrown/written: `pocketpal-ai/src/services/downloads/DownloadManager.ts:278-282`
  (`throw new Error('Not enough storage space to download the model')`)
- dialog host: `screens/ModelsScreen/ModelsScreen.tsx:415-431`
  (`<DownloadErrorDialog error=…>` at :417, `onTryAgain={modelStore.retryDownload}` at :430);
  dialog takes `error: ErrorState` and branches on `error.code === 'storage'`:
  `components/DownloadErrorDialog/DownloadErrorDialog.tsx:19-46`
- retry button itself carries no reason: `ModelsScreen.tsx:392 onRetry={handleRetryAction}`
- card-level `HelperText` (`ModelCard.tsx:748-757`) is a PRE-download storage check
  (`!storageOk && !isDownloaded`), not a failure reason.

**LiAI side (file:line):**
- store writes the reason: `store/models/downloads.ts:145,165,212,223`
- `components/models/ModelBits.tsx:129` DownloadButton, `:146` `error?: string`,
  `:153` `const reason = isFailed && error ? error : undefined` (absent ⇒ undefined ⇒ "Retry"),
  `:186` a11y label `Retry download${reason ? \`. ${reason}\` : ""}`, `:204-207` inline reason
  (`max-w-[160px]`, no `numberOfLines` — never truncated to nothing)
- every failed-state caller passes it: `ModelCard.tsx:145`, `HFModelSearch.tsx:471`,
  `AvailableModels.tsx:142`
- source-scan guard: `tests/download-error.test.ts:18-73` (renders reason, keeps "Retry" floor,
  a11y carries reason, all three callers pass it)

**Classification: PREMISE WRONG.** Issue Notes claim "PocketPal has no direct
equivalent" — false: `ModelsScreen.tsx:415-431` shows the stored reason with retry.
All five acceptance criteria are met by LiAI; the inline-on-button vs modal-dialog
surface difference was chosen without acknowledging PocketPal's dialog
(undeclared, minor).

---

## 02 — Configurable remote request timeout (C5) — **PARITY**

**PocketPal side (verified):** issue citation `openai.ts:503-524` is correct
(timers actually span :503-527):
- `src/api/openai.ts:469-470` `resolveTimeout(timeoutMs, CONNECTION_TIMEOUT_MS / IDLE_TIMEOUT_MS)`
- connection timer `:503-511` (abort, "Connection timed out"); per-chunk idle timer
  `:514-527` (reset per chunk, "Idle timeout")
- constants/rule: `src/api/http.ts:1-2` (30 000 / 60 000), `:10-17`
  (`timeoutMs == null || !finite || <= 0 → default` — same predicate as LiAI's `positiveFinite`)
- per-endpoint UI exists: `components/RemoteModelSheet/RemoteModelSheet.tsx:142,146,276`;
  `utils/timeout.ts:2-9` `parseTimeoutMs`: "empty/invalid/non-positive → undefined".

**LiAI side (file:line):**
- `lib/inference/remote-engine.ts:23` `DEFAULT_TIMEOUT_MS = 120_000`;
  `:29` `normalizeTimeoutMs = positiveFinite`; `:75` `normalizeTimeoutMs(options.timeoutMs) ?? DEFAULT`;
  `:95` single `setTimeout(() => controller?.abort(), timeoutMs)`; cleared in `finally` (:171-173)
- rule: `lib/guards.ts:18-22` (finite && > 0, else undefined)
- engine receives stored value: `store/chat/index.ts:154`
  `createRemoteEngine(provider, getKey, { timeoutMs: provider.timeoutMs })`
- UI: `components/models/RemoteModelSheet.tsx:56-62` (empty ⇒ undefined = default;
  invalid ⇒ form error "Timeout must be a positive number of seconds" :62),
  field `:236-243`; persistence whitelist `lib/model-upgrade.ts:164-166`
- tests: `tests/remote-engine.test.ts:214` (value reaches the abort timer),
  `:234` (completed turn unaffected), `:258` (0 ⇒ default), `:275-283` (one rule),
  `:321-333` (source-scan: store forwards `provider.timeoutMs`)

**Classification: PARITY** on semantics (empty→default, non-positive rejected,
persisted, reaches the timer). Declared deltas: LiAI uses one overall fetch-abort
instead of PocketPal's connection+idle pair — the issue body itself declares the
port unnecessary ("UI + persistence gap only"); UI shows a form error where
PocketPal silently drops the invalid value (both never store it). Incidental:
PocketPal's defaults are 30s/60s; LiAI keeps its 120s default (issue set no parity target).

---

## 03 — Preset missing from every tier (C9) — **PARITY**

**PocketPal side (verified):** premise holds — PocketPal has a per-model
`min_app_version` gate (device-rules v2), correctly declared out of scope:
`src/services/deviceRules/appVersion.ts` `passesMinAppVersion`
(tests `services/deviceRules/__tests__/appVersion.test.ts:21-38`).

**LiAI side (file:line):**
- only tier-listed presets render, with the guard named in the comment:
  `components/models/AvailableModels.tsx:252-257` (`tiers.map`, `tier.presetIds.includes(p.id)`) —
  issue citation `:252` correct (comment occupies :252-254, map at :256)
- decision (c) implemented as tests: `tests/preset-catalog.test.ts`
  `:47-53` catalog ⊆ tiers ("is fully covered by device tiers"),
  `:55-64` tiers ⊆ catalog (stale tier id fails), `:66-73` no id in two tiers;
  decision recorded in the test header `:8-15` and in the issue file
  (`.scratch/…/03-tier-preset-coverage.md:25` Decision block; commit 4c56a7c)
- tier matching untouched as required: `lib/models/device-tiers.ts:16-37` parseTiers,
  `:40-53` matchTier (issue citation `:16-53` correct; MiB-not-decimal note `:45-46`)
- counts verified from assets: 18 presets (`lib/models/huggingface.ts`, 18 `repo:` entries),
  18 `presetIds` across 3 tiers (`assets/device-tiers.json`)

**Classification: PARITY.** No runtime fallback in `AvailableModels` (matches
decision (c)); the forward guard pre-existed, this issue added reverse + duplicate
directions — both present.

---

## 04 — Macrotask yield during streaming (C16) — **PARITY**

**PocketPal side (verified):** issue citation `useChatSession.ts:722` exact:
- `src/hooks/useChatSession.ts:656-664` comment + `YIELD_INTERVAL_MS = 100`
- `:722-724` `if (performance.now() - lastYieldTs >= YIELD_INTERVAL_MS) { await new Promise(r => setTimeout(r, 0)); … }`
  inside the token chain.

**LiAI side (file:line):**
- `store/chat/send.ts:52-67` `startStreamYield(intervalMs = 100, onTick?)` — self-scheduling
  100 ms timer, returns release handle; armed `:171`, released in `finally` `:225`
- covers every turn path (send/retry/regenerate/edit all route through `runLocal`:
  `send.ts:349,387,404,446,490`); idle holds no timer
- tests `tests/chat-store.test.ts:999-1034`: periodic while held, never after release,
  `runLocal` holds for whole turn + `finally` release

**Classification: PARITY** (interval identical: 100 ms; fires only while a turn is
in flight; output path untouched). Incidental, declared in code: LiAI runs a
self-scheduling timer instead of PocketPal's in-chain per-token `await setTimeout(0)`
(`send.ts:38-41`), and the code admits device confirmation is the real check
(`send.ts:41-46`, ponytail note — upgrade path is deletion).

---

## 05 — Cached/reused prompt token accounting (C3) — **DECIDED DIVERGENCE**

**PocketPal side (verified):** issue citation `servers/index.ts:334-345` — path
shorthand (real path `src/api/servers/index.ts`), lines essentially correct
(`readFinish` :333-345):
- `src/api/servers/index.ts:326-331` comment: `prompt_n + cache_n`, each key
  guarded independently ("old build omits `cache_n`" ≠ "cold prompt reports 0")
- `:340-343` `tokensEvaluated = (prompt_n ?? 0) + (cache_n ?? 0)` (wire formula).

**LiAI side (file:line):**
- local: `lib/inference/local-engine.ts:209-224` — comment cites issue 05 Decision;
  `:221-224` `promptTokens = typeof result.tokens_cached === "number" ? tokens_cached
  : asNumber(result.tokens_evaluated)`; `cache_n` deliberately not read; reported 0 is a fact
- remote: `lib/inference/remote-engine.ts:127-140` — `promptTokens = prompt_tokens
  ?? cached_tokens ?? 0`, never summed (OpenAI contract comment :127-132)
- consumers: `lib/chat/context-fill.ts:8-13` (documented as C3 figure);
  banner meter `app/(drawer)/(tabs)/chat.tsx:586`, threshold `:252` — same figure;
  agent occupancy `lib/agent/runner.ts:179-184`
- tests: `tests/local-engine.test.ts:215-235` (1200→1200; absent→fallback 1000;
  `tokens_cached: 0` → 0), `tests/remote-engine.test.ts:301,311` (never double count;
  cached fallback), `tests/context-fill.test.ts:120`

**Classification: DECIDED DIVERGENCE** — decision source: issue 05's own
`## Decision (recorded)` block (05-cached-token-accounting.md:31+): `tokens_cached`
authoritative, PocketPal's `prompt_n + cache_n` deliberately not ported, remote
`prompt_tokens` includes the cached subset. Implemented exactly as decided.
**Premise check (starting state):** `git show ba1e941^:lib/inference/local-engine.ts`
had `promptTokens: asNumber(result.tokens_evaluated)` — so an under-reported
occupancy existed; the literal claim ("`tokens_cached`/`cache_n` never read on
either engine") is TRUE for the named keys. **Files staleness:** `types/models.ts`
is listed but untouched by C3 (ba1e941); `lib/agent/runner.ts` + `lib/inference/engine.ts`
changed but are not listed.

---

## 06 — Remote `/props` capability probe (C7) — **UNDECLARED DIVERGENCE**

**PocketPal side (verified):** citation `props.ts:70-125` accurate (±2: function
`src/api/llamaServer/props.ts:68-126`); `:100-104` ≈ `describesModel` at `:102-105`:
- `:23` `PROPS_TIMEOUT_MS = 5000`; never throws: non-2xx → `{}` `:89-91`,
  `catch { return {} }` `:120-122`
- n_ctx `default_generation_settings.n_ctx ?? n_ctx`, finite>0: `:95-100`
- `:102-105` `describesModel` = modelPath non-empty & ≠ "none" OR contextLength known
- **`:109` `caps.supportsVision = data?.modalities?.vision === true;` — set whenever
  the body describes a model, so absent `modalities` ⇒ `false` ("unsupported")**
- also captures `samplerDefaults` `:111-115` (out of LiAI's acceptance scope)
- keying: `store/ServerStore.ts:74-76` `remoteCaps` keyed by full model id,
  dropped on server/model change `:143-177`; binding guard `utils/remoteCaps.ts:16-33`.

**LiAI side (file:line):**
- `lib/models/remote-api.ts:19-21` `PROBE_TIMEOUT_MS = 5000` (same rationale comment);
  `probeRemoteCaps :34-77`: never throws (`catch :74-76`), non-2xx → `{}` `:57-58`,
  `custom_openai` only `:37` (mirrors PocketPal's `hasProps` gate, declared `:30-34`),
  `?model=` scoping `:54-55`, n_ctx `:62-65`, `describesModel :68-70`,
  **`:77-78` `if (modalities) caps.supportsVision = modalities["vision"] === true;`**
- field-wise, per-model merge: `mergeRemoteCaps :86-107` (prior only when
  `previous.model === next.model`); identity-change strip `:109-117`
- store: `store/models/remote.ts:128-141` (probe only after validation, merge keyed
  `provider.id` :137, strip on edit :94); type `types/models.ts:147-157`
- tests: `tests/remote-caps.test.ts:54-214` (all acceptance paths, incl. `:95`
  every failure → unknown, `:80` router placeholder discarded, `:198` keyed per model).

**Classification: UNDECLARED DIVERGENCE (one delta; acceptance otherwise fully met).**
Body describes a model but omits `modalities` → PocketPal records
`supportsVision: false` (`props.ts:109`); LiAI records unknown (`remote-api.ts:77-78`).
No decision record covers it — only code comments (`remote-api.ts:43-44`,
`types/models.ts:154-156`); not in the issue file (06 has no Decision block) and not
in D-doc §3. **Currently latent:** nothing in LiAI consumes `supportsVision`
(grep: only `remote-api.ts:16,78,103-104` and `model-upgrade.ts:130-131`), so no
user-visible behaviour differs yet. Minor scope notes: `samplerDefaults` not ported
(not in acceptance); OpenRouter never probed (declared).

---

## 07 — Warn at 80% before the window fills (C4) — **PARITY**

**PocketPal side (verified):** citation `bannerVariantResolver.ts:3` exact:
- `src/utils/bannerVariantResolver.ts:3` `WARNING_THRESHOLD = 0.8`
- `:6` `AUTOCLEAR_RUNWAY = 256` — note: the runway belongs to the CONTEXT-FULL
  gate (`used >= nCtx - AUTOCLEAR_RUNWAY`, `:79-86`) and its auto-clear, not to the
  warning branch
- warning gate `:88-97`: `!contextFull && used/nCtx >= 0.8 && !dismissed`, needs known
  `effectiveNCtx` (`:60-66`), resolution order comment `:40-44`.

**LiAI side (file:line):**
- `lib/chat/context-fill.ts:18` `NEAR_LIMIT_FILL_PCT = 80`; `:39-49` `isNearLimit`
  (≥ 80 % of fillPercent; unknown window/occupancy ⇒ false); `:26-37` `effectiveNCtx`
  (local nCtx vs probed remote `contextLength`, unknown ⇒ undefined — never the local setting)
- window wired from C7: `chat.tsx:237-245`; threshold gate `:249-253`
  (`contextFullTurnId === null && isNearLimit(usage.promptTokens, windowSize)`);
  full-banner precedence `:255-256`; per-turn dismissal `:224-231`
- one banner, same actions ("More room / New chat / Dismiss"): `:584-593`;
  `components/chat/ContextFullBanner.tsx:35-46` (`variant: "full" | "warning"`,
  full variant copy unchanged `:67-70`)
- tests: `tests/context-fill.test.ts:98-115` (threshold pinned, never warns blind),
  `:120-134` (corrected figure + precedence), chat.tsx wiring pins read as text `:118+`.

**Classification: PARITY** — all six acceptance criteria met: pre-failure warning,
corrected C3 occupancy, remote denominator from C7, same actions, per-turn dismissal,
full banner unchanged with precedence. Deltas (minor):
1. `fillPercent` rounds (`context-fill.ts:52-56`), so LiAI warns in the
   [79.5 %, 80 %) band where PocketPal's raw ratio does not — sub-1pp, test-pinned
   band (`context-fill.test.ts:102-106`).
2. Issue-body imprecision worth correcting: the "256-token runway" is PocketPal's
   *context-full* auto-clear gate, not part of its 80 % warning. LiAI's full banner
   keys off the native per-turn flag (`local-engine.ts:235`
   `context_full || truncated`) with no runway — pre-existing G1 design, not a C4 gap.

---

## 08 — Markdown links open (C2) — **PARITY** (citation stale, known)

**PocketPal side (verified):** guard is at **`WebSearchResultsSheet.tsx:24`, not :38**
(issue citation stale — the known correction; :38 lands inside the props destructure):
- `src/components/WebSearchResultCard/WebSearchResultsSheet.tsx:24`
  `const isOpenableUrl = (url) => /^https?:\/\//i.test(url);`
- failure surfaced, not silent: `openUrl` catch → Snackbar `:34-45`, rendered `:110-123`
- non-openable result renders as a plain `View` (no press) `:105-117`.

**LiAI side (file:line):**
- guard verbatim: `lib/chat/links.ts:9-10` `/^https?:\/\//i`
- `components/chat/MarkdownView.tsx:36-46` `openLink` — `Linking.openURL`, failure →
  `setChatWarning({message: "Couldn't open that link."})` (surfaces in
  `ChatWarningSnackbar`, `chat.tsx:576`)
- `link()` override `:117-141`: unopenable href → `this.text(children)` (plain text,
  no press), openable → `selectable`, `accessibilityRole="link"`, `accessibilityHint={href}`
- linked images share the guard `:146-164`
- tests `tests/markdown-links.test.ts:24-90` (guard verbatim, every other scheme
  refused, plain-text fallback, failure surface, selection, images).

**Classification: PARITY.** Citation correction confirmed: `:38` → `:24`.
Note on the declared ChatWarningSnackbar surface: issue 08's file has **no Decision
block** (only 03/05/12 do); the choice is recorded in the code comment
`MarkdownView.tsx:31-34` plus acceptance "inline message rather than silence".
PocketPal's equivalent is a sheet-local Snackbar — both are transient messages,
so this is a surface difference within the same intent. Pre-change citations in the
issue body (`MarkdownView.tsx:20` class, `:29` renderer) were exact at slice time
(verified `git show a986428:components/chat/MarkdownView.tsx`); current locations
are `:104` / `:182`.

---

## 09 — Render markdown tables (C13) — **PARITY**

**PocketPal side (verified):** issue claim confirmed — tables exist and are wired
into BOTH content and reasoning:
- `src/components/MarkdownView/TableRenderers.tsx:19-42` custom element models
  (so table tags aren't dropped), `:131-170` row rendering with
  `ScrollView horizontal` (`:131`), header row fill (`:140,:145-152`)
- borders/fill styles: `tableStyles.ts:3-27` (`borderWidth:1`, `headerRow.backgroundColor :22-23`)
- content provider: `MarkdownProvider.tsx:13,:48` `...tableRenderers` in the module-scope
  renderers map (`:41-45` stable identity); reasoning provider:
  `ReasoningBlock.tsx:11-12,:49` `useMemo(() => ({...tableRenderers}))`, `:74` custom models.

**LiAI side (file:line):**
- hook verification (the issue's "verify before designing"): exists —
  `node_modules/react-native-marked/dist/typescript/lib/types.d.ts:43`
  `table(header, rows, …)` (issue comment cites library source `lib/types.ts:86`;
  same hook, path differs)
- `components/chat/MarkdownView.tsx:165-170` `table()` override;
  `MarkdownTable :72-101`: header fill (`:91-94`), 1px cell grid, horizontal
  `ScrollView` `:77`, one shared column width `:56`
- same renderer for body and reasoning (`dense`) `:196-199` — reasoning tables by construction
- module-level renderer identity: `:182` (issue's `:29` was the pre-change file —
  identity preserved, which is what acceptance required)
- tests `tests/markdown-tables.test.ts:25-71` (hook wired, visible structure,
  shared width, horizontal scroll, renderer identity, body+reasoning).

**Classification: PARITY.** All four acceptance criteria met; the "decide or visibly
unsupported" question resolved in favour of rendering in reasoning too.

---

## 10 — Session list grouped by date (C11) — **PARITY**

**PocketPal side (verified):** both citations exact:
- `src/components/SidebarContent/SidebarContent.tsx:315-322` — "Convert groupedSessions
  to SectionList format" at :315
- `src/store/ChatSessionStore.ts:1194-1199` — pinned hoisted into leading group
  (`orderedGroups[this.dateGroupNames.pinned] = pinnedSessions.sort(…)` at :1194-1195)
- grouping math `:1144-1167`: `daysAgo = ceil((now - date)/day)` `:1147-1150`,
  calendar-day today/yesterday first, then ≤6 / ≤13 / ≤20 / ≤27 / ≤34 / ≤60 / older;
  order list `:1180-1190`; per-group newest-first `:1201-1209`.

**LiAI side (file:line):**
- `lib/chat/session-groups.ts:47-66` `sessionBucket`: calendar-day today/yesterday
  (`:48-59`, DST-normalized), `daysAgo = ceil` `:61`, ≤6 `:62`, ≤13 `:63`,
  ≤34 `:64` (merged 2–4 weeks), ≤60 `:65`, older `:66`
- pinned section first `:78-81`; each group newest-first `:73,:92`
- derived, no schema change: `components/chat/SessionList.tsx:56-57` `useMemo(groupSessions)`,
  SectionList with sticky opaque headers `:241-251`, empty state `:253-256`,
  current session selected (`accessibilityState={{selected}}` `:283-293`)
- tests `tests/session-groups.test.ts:40-141` (calendar-day today/yesterday, PocketPal
  day thresholds, section order incl. "2–4 weeks", pinned hoist, newest-first,
  empty list, accessible headers, sticky reachability).

**Classification: PARITY.** Bucket boundaries match PocketPal exactly except the
deliberate merge of PocketPal's separate 2/3/4-week buckets (`ChatSessionStore.ts:1159-1163`)
into one "2–4 weeks" section — declared in the issue's own Acceptance list and in
`session-groups.ts:1-7`. **Files staleness:** issue names `store/chat/sessions.ts`
but commit fdd53e1 did not touch it (grouping is component-derived).

---

## 11 — Bulk select / delete / export (C12) — **PARITY**

**PocketPal side (verified):**
- `SidebarContent.tsx:184-190` row-menu "Select…" — issue citation `:186` exact
  (`onPressSelect(session.id)` at :186)
- selection header: `:201-270` (selected count `:226-228`, export button `:234-246`,
  delete button `:250-262`), select-all row `:273-301`, per-row checkbox `:95-98`
- count-confirmed bulk delete: `:427-451` — citation `:427` exact;
  `bulkDeleteMessage` gets `count` `:428-434`
- bulk export: **issue citation `:458` is stale** — :458 is the closing brace of the
  bulk-delete callback; `handleBulkExport` is `:464-472`
- store: `ChatSessionStore.ts:1333` enterSelectionMode, `:1374` bulkDeleteSessions,
  `:1404-1407` bulkExportSessions → `ChatSessionRepository.ts:406-414`
  **loops `exportChatSession(id)` — one FILE PER SESSION**, not one JSON.

**LiAI side (file:line):**
- explicit mode: `components/chat/SessionList.tsx:194-201` ("Select" button, not long-press)
- header `:139-200`: count `:141-143`, select-all `:149-161`, delete `:162-174`,
  export `:175-187`, Done `:188-199`; per-row checkbox `:305-320`
- count-confirmed delete: `:95-109` `Delete ${count} conversations?`;
  kept-count honesty notice `:117-124`
- selection cleared on session switch `:64-66`, drawer close `:55-58`
  (`exitSelection` `:74-77`)
- bulk delete honours mid-turn guard per id and returns real count:
  `store/chat/sessions.ts:196-207` (mirrors the `:154` single-row guard)
- one JSON via existing serializer: `components/AppDrawer.tsx:44-59`
  (`readExportSessions` + `toAllSessionsJson`, `lib/chat/export.ts:95`), wired `:95-96`
- tests `tests/session-bulk.test.ts:26-105` (every acceptance bullet, incl. `:43`
  explicit count, `:81` reuses toAllSessionsJson, `:91` bulk routes through deleteSession).

**Classification: PARITY** on the feature set. Declared shape difference: LiAI's
one-JSON-of-selected vs PocketPal's one-file-per-session loop
(`ChatSessionRepository.ts:406-414`) — decision source is the issue's own Acceptance
("reusing toAllSessionsJson rather than a second serializer"). Citation drift noted:
`:458` → `:464`.

---

## 12 — Per-model thinking capability + override (C6) — **DECIDED DIVERGENCE**

**PocketPal side (verified):** citation `reasoningCapability.ts:70-103` exact
(function is :70-104, the file's last line):
- provenance documented `:9-14` `user > learned > detected > unknown`
- `:70-95` `resolveReasoningCapability`: stored field first (user/learned),
  `supportsThinking true/false` → `source: 'detected'` `:85-90`, else unknown;
  two axes — axis-2 effort inert when axis-1 is 'no' `:97-103`.

**LiAI side (file:line):**
- resolver `lib/inference/thinking.ts:31-44`: **user > detected > global("unknown")** —
  PocketPal's provenance minus `learned` (declared in the resolver's header comment `:1-10`
  and the issue Decision)
- typed tri-state field: `types/models.ts:58` `reasoning?: boolean` (+ comment `:52-57`
  rejecting `capabilities` parsing); user axis `store/inference.ts:54`
  `thinkingOverrides`, defaults `:119-120`, hydrate guard `:138,:183`,
  merge-patch setter `:356-359`
- turn resolves per model: `store/chat/index.ts:203-222` (`resolveThinking` with
  `spec.reasoning`, remote ⇒ null id ⇒ global; fail-open `catch → true`),
  seam `:289 getThinking`; `lib/chat/turn.ts:121,:149` conditional `enableThinking`
- engine: `lib/inference/local-engine.ts:151` `reasoning_format: "auto"`,
  `:158-160` `enable_thinking` only when the request carries it (conditional spread)
- composer pill resolves + writes override: `components/chat/MessageInput.tsx:109-115`,
  `:484` renders whenever a local model is active (absent capability ⇒ renders as today),
  `:502-506` override when a model is active, global otherwise
- tests `tests/thinking-capability.test.ts:50` (unchanged default),
  `:73` (known non-reasoner never receives `enable_thinking: true`),
  `:95` (override beats detection both ways), `:155` (survives plain settings save + reload),
  `:191,:198,:209`; `thinking-pill.test.ts:198`.

**Classification: DECIDED DIVERGENCE** — decision sources verified: issue 12's own
`## Decision (recorded)` block (12-per-model-reasoning.md:31+) for the typed field and
user>detected>global resolver; **D-doc §3 row 1** (`2026-10-06-pocketpal-chat-divergence.md:83`)
for the omitted graded-effort cycle. Both implemented as decided.
**Premise (self-declared, reconfirmed):** the issue's claim that `local-engine.ts`
sends `enable_thinking` *unconditionally* was already false at slice time —
`git show a986428:lib/inference/local-engine.ts` shows the conditional spread; the
issue's own Decision records it as a stale premise and says no change was needed in
`local-engine.ts`/`turn.ts` (confirmed: commit d60bf8d touches neither).

---

## 13 — Per-tool-call token/time cost (C15) — **PARITY**

**PocketPal side (verified):**
- `src/components/ToolMetricsFooter/ToolMetricsFooter.tsx` — issue citation `:28`
  is the component export; the feature sits around it: format `` `1,500 tokens · 35s` `` `:19`,
  "Renders nothing if `metrics.tokens` is 0" doc `:24-27`, actual guard
  `:35-37` `if (metrics.tokens <= 0) return null`, **floor `:41`
  `Math.max(1, Math.round(metrics.durationMs / 1000))`**
- capture: `src/services/agent/AgentRunner.ts:411-430` — issue citation `:422` exact
  (`callsWithoutMetrics && toolCallStartedAt !== null ? … metrics: { tokens, durationMs }`),
  only attached when tool-call tokens were seen `:420`, counts streaming events `:308-309`.

**LiAI side (file:line):**
- formatter parity: `lib/format.ts:17-20` — null when `tokens <= 0`; `Math.max(1, …)`
  floor-to-1s; `` `${toLocaleString("en-US")} tokens · ${seconds}s` ``
- capture: `lib/agent/runner.ts:201-211` — per generation turn
  `tokens = outcome.completionTokens`, `durationMs = Date.now() - turnStartedAt`,
  absent when the engine reported no tokens (`:208`); replicated onto each call of a
  multi-tool turn — comment `:203-206` explicitly cites PocketPal accepting the same
  overstatement
- placement under the result: `components/chat/MessageListItem.tsx:220-224`
  (failure block + comment "cost belongs under the RESULT, not in the turn footer"),
  static chip suffix `:241-252`; sheet surfaces: `components/chat/toolSurfaces.tsx:51-60`
  `ToolMetricsLine`, used at `:107,:129` (sheet surfaces), `:220-229` (static rows);
  turn footer untouched by c252091 (`MessageActions.tsx` not in the commit)
- persistence (additive): `lib/chat/tinybase-store.ts:256-262` write,
  `:339-347` read — legacy rows → no metrics
- tests `tests/tool-metrics.test.ts:33` (formats like PocketPal), `:44` (renders nothing
  at 0), `:49` (floor 1s), `:94` (per-turn carry), `:124` (legacy row round-trip),
  `:158,:166` (sheets + chip), `:176` (step map forwards metrics).

**Classification: PARITY.** Format, floor-to-1s, and the "0 tokens ⇒ render nothing"
gate match PocketPal line-for-line in behaviour. Incidental: PocketPal counts only
tool-carrying streaming events (`AgentRunner.ts:308-309`) while LiAI uses the whole
generation turn's `completionTokens` (`runner.ts:208-210`) — both are documented as
accepting the same multi-tool overstatement; anchors (tool-call start vs turn start)
are equivalent in practice.

---

## 14 — Lazy session metadata + hydrate on open (C17) — **PARITY**

**PocketPal side (verified):** both citations exact:
- `src/store/ChatSessionStore.ts:271` `async loadSessionList()`; metadata-only read
  `:281 getSessionMetadataWithSettings`; `:288` "DON'T load messages - leave array empty";
  `:310 messagesLoaded: false`
- `:406` `async setActiveSession`; guard `:410-412`
  `if (session && !session.messagesLoaded) await this.loadSessionMessages(…)`; flag set `:399`.

**LiAI side (file:line):**
- listing never reads turn bodies: `lib/chat/tinybase-store.ts:355-370` `listSessions`
  reads only the `sessions` table (title/pinned/updatedAt/seq)
- hydrate once: `:179-190` read-through `hydrated` Map (`:118-133` with the full
  staleness contract: every writer clears its entry BEFORE writing), fresh array
  per caller `:188-190`
- invalidation on every mutating path: missing row `:176`, append `:205`,
  delete `:387` (+ draft/sampler/pointer cleanup `:389-396`), `:420`, `:438`
- contract on the port interface: `lib/chat/session-store.ts:74-79` (get doc — hydrate-once)
- open path: `store/chat/sessions.ts:154-169` `switchSession` → `store.get(id)` (served
  from memory on re-open); mid-turn refusal `:154`; pointer reconcile against a deleted
  session in `loadSession :105-141` (`:127-134` clear + empty)
- tests: `tests/tinybase-store.test.ts:802-896` (source-pins listSessions `:818`,
  hydrate-once `:827`, invalidation on write `:851-874`, duplicate `:892`);
  `tests/chat-store.test.ts:68` (pointer reconcile, C17).

**Classification: PARITY.** All six acceptance bullets verified.
**Files staleness confirmed (known):** commit c45edcd touched only
`session-store.ts` (contract comment) + `tinybase-store.ts` + tests —
`store/chat/sessions.ts` (listed) needed no change; its reconcile/mid-turn behaviour
already existed.

---

## Citation audit (issue claim → verified location)

| Issue | Claimed | Verified | Verdict |
|---|---|---|---|
| 01 | `ModelBits.tsx:152`, `types/models.ts:48` | pre-change start state; `types/models.ts:48` still exact | OK (start-state) |
| 02 | `openai.ts:503-524` | `src/api/openai.ts:503-527` | OK |
| 03 | `AvailableModels.tsx:252`, `device-tiers.ts:16-53` | `:252` (comment), map `:256`; `:16-53` | OK |
| 04 | `useChatSession.ts:722` | `:722-724` | exact |
| 05 | `servers/index.ts:334-345` | `src/api/servers/index.ts:333-345` | path shorthand; lines OK |
| 06 | `props.ts:70-125`, `:100-104` | `props.ts:68-126`, `:102-105` | ±2 lines, OK |
| 07 | `bannerVariantResolver.ts:3` (+256 runway) | `:3` exact; runway at `:6` but it gates context-FULL, not the warning | citation OK, wording imprecise |
| 08 | `WebSearchResultsSheet.tsx:38` | **`:24`** (:38 = props destructure) | **STALE (known)** |
| 09 | renderer identity `MarkdownView.tsx:29` | pre-change `:29` exact; now `:182` | OK (start-state) |
| 10 | `SidebarContent.tsx:315`, `ChatSessionStore.ts:1194` | `:315-317`, `:1194-1195` | exact |
| 11 | `SidebarContent.tsx:186,427,458` | `:186` ✓, `:427` ✓, **`:464`** for bulk export | **:458 stale (7 lines, wrong callback)** |
| 12 | `reasoningCapability.ts:70-103` | `:70-104` | exact |
| 13 | `ToolMetricsFooter.tsx:28`, `AgentRunner.ts:422` | component `:28`, format `:19`, guard `:35-37`; `:422` exact | OK (in-range) |
| 14 | `ChatSessionStore.ts:271,406` | `:271`, `:406` | exact |

Files-list staleness: 05 lists `types/models.ts` (untouched; misses `runner.ts`/`engine.ts`);
10 lists `store/chat/sessions.ts` (untouched); 14 lists `store/chat/sessions.ts` (untouched).
Issue 12's Files (`local-engine.ts`, `turn.ts`) were already declared stale by its own Decision.

---

## Summary table

| # | Gap | Classification | One-line note |
|---|---|---|---|
| 01 | C1 download failure reason | **PREMISE WRONG** | "PocketPal has no direct equivalent" is false — `DownloadErrorDialog` (`ModelsScreen.tsx:415-431`); LiAI acceptance itself fully met |
| 02 | C5 remote timeout | **PARITY** | Same rule (empty→default, non-positive rejected), wired to engine; single timer vs PP's connection+idle pair declared in issue body |
| 03 | C9 tier coverage | **PARITY** | Decision (c) implemented as 3 test directions; no runtime fallback; `device-tiers.ts` untouched as required |
| 04 | C16 stream yield | **PARITY** | 100 ms identical, turn-scoped, never idle; timer-loop vs in-chain yield documented in `send.ts:34-47` |
| 05 | C3 cached tokens | **DECIDED DIVERGENCE** | Issue 05 Decision: `tokens_cached` authoritative, PP's `prompt_n+cache_n` deliberately not ported — implemented verbatim |
| 06 | C7 `/props` probe | **UNDECLARED DIVERGENCE** | Body-with-model but no `modalities`: PP `supportsVision=false` (`props.ts:109`) vs LiAI unknown (`remote-api.ts:77-78`); no decision record; latent (no consumer) |
| 07 | C4 80% warning | **PARITY** | Threshold 80 exact (`bannerVariantResolver.ts:3` ↔ `context-fill.ts:18`); ≤0.5pp rounding band; 256 runway belongs to PP's full-banner gate, not the warning |
| 08 | C2 markdown links | **PARITY** (citation stale) | Guard verbatim `/^https?:\/\//i`; correct PP location `:24` not `:38` (known); a11y+plain-text+failure surface all present |
| 09 | C13 tables | **PARITY** | Hook exists; header fill + borders + h-scroll; same renderer serves reasoning; PP wired in both providers as claimed |
| 10 | C11 date grouping | **PARITY** | Day boundaries match (≤6/≤13/≤34/≤60, calendar today/yesterday); 2/3/4-week merge declared by issue acceptance |
| 11 | C12 bulk actions | **PARITY** | Explicit mode, select-all, count confirm, mid-turn guard, one-JSON export (declared vs PP per-file loop); `:458`→`:464` citation drift |
| 12 | C6 per-model thinking | **DECIDED DIVERGENCE** | Issue 12 Decision + D-doc §3 row 1: typed field, user>detected>global (minus `learned`), no effort cycle — implemented; unconditional-`enable_thinking` premise self-declared stale and reconfirmed false at slice time |
| 13 | C15 tool metrics | **PARITY** | Format `1,500 tokens · 35s`, floor-to-1s, 0-tokens⇒null all match (`formatToolMetrics` ↔ `ToolMetricsFooter`); under result, not turn footer |
| 14 | C17 lazy hydration | **PARITY** | Metadata-only listing, hydrate-once cache + writer invalidation, pointer reconcile, mid-turn guard; Files list's `sessions.ts` indeed unchanged |

**Counts:** PARITY ×10 (02, 03, 04, 07, 08, 09, 10, 11, 13, 14) ·
DECIDED DIVERGENCE ×2 (05, 12) · UNDECLARED DIVERGENCE ×1 (06) ·
PREMISE WRONG ×1 (01) · CITATION STALE ×0 as a primary label
(08's stale `:38` is noted under its PARITY verdict; corrections in the citation audit).

---

## Worth acting on

1. **Issue 06 — undeclared vision semantics.** `remote-api.ts:77-78` records
   `supportsVision` as unknown when a describing body omits `modalities`, where
   PocketPal records `false` (`props.ts:109`). It is only declared in code comments —
   add it to D-doc §3 (or flip the read) before anything consumes `supportsVision`;
   today the field has no consumer, so the fix is cheap now and a surprise later.
2. **Issue 01 — premise correction.** "PocketPal has no direct equivalent" is wrong
   (`DownloadErrorDialog`, `ModelsScreen.tsx:415-431`). LiAI's inline-on-button reason
   meets its acceptance, but the dialog-vs-inline surface choice was made against a
   false baseline — record it so later audits don't inherit the claim.
3. **Citation hygiene (low priority):** issue 08 `:38`→`WebSearchResultsSheet.tsx:24`;
   issue 11 `:458`→`:464`; issue 05 path `src/api/servers/index.ts`; Files lists in
   05/10/14 each name one file that needed no change.
4. **Issue 07 — rounding band (cosmetic).** `fillPercent` rounds, so the warning can
   fire up to 0.5pp below PocketPal's raw `ratio >= 0.8` (`context-fill.ts:52-56`).
   Test-pinned; fix only if exact-threshold parity is ever required.
