# PocketPal AI — Chat Message UI: Gap Audit

Date: 2026-10-06. Reference: `D:\aivision\pocketpal-ai\src`. User app: `D:\aivision`.
Scope: the **assistant reply surface** — markdown, code, tables, links, tool-call
rendering, reasoning, actions menu, and every message state (streaming, pending,
interrupted, context-full, error, usage). Companion to
`2026-10-06-pocketpal-models-screen-audit.md`.

Read §2 before reading this as a to-do list: **LiAI is ahead on 13 items**, and
several "differences" are deliberate choices, not gaps.

---

## 1. Architecture baseline

The single most consequential difference is structural, and it explains most of
the smaller ones.

| | PocketPal | LiAI |
| --- | --- | --- |
| Row model | `assistant_turn` = **N steps per FlatList row**; each step may carry reasoning, a text fragment and a talent surface, rendered as **sibling blocks** in one row (`Message/Message.tsx:224-360`) | One row = one `ChatMessage`; tool steps render *inside* the text bubble (`MessageListItem.tsx:169-245`) |
| Markdown engine | `marked` → HTML → `react-native-render-html` (`MarkdownView.tsx:31`, `MarkdownProvider.tsx:56`) | `react-native-marked` native renderers, no HTML layer (`MarkdownView.tsx:203`) |
| Reasoning per turn | **Many** blocks, interleaved between text blocks | **One** (`message.reasoning` is a single string, `lib/chat/turn.ts:44`) |
| Store | MobX | Zustand |

---

## 2. LiAI is ahead (do NOT port these "gaps" backwards)

| # | Item | Evidence |
| --- | --- | --- |
| 1 | **Tap-to-retry error card** for a failed turn. PocketPal has **no** assistant error bubble *and* no retry — failures surface as a sticky banner | `MessageListItem.tsx:98-117` vs `StatusIcon.tsx:36-43` |
| 2 | `UsageStats` session aggregate (turns · in · out) | `UsageStats.tsx:10-24` — no PocketPal equivalent |
| 3 | **Selectable** markdown text | `MarkdownView.tsx:184`; PocketPal locks `selectable:false` app-wide (`MarkdownProvider.tsx:40-43`) |
| 4 | Explicit markdown type scale (h1 24 / h2 20 / h3 18 / h4–6 16, Inter SemiBold) | `MarkdownView.tsx:227-232`; PocketPal defines **no** h1–h6 styles (`MarkdownView/styles.ts:14-72`) |
| 5 | `read_url` tool surface (model-copy vs article split, `· cut off` marker) | `toolSurfaces.tsx:249-280` — no PocketPal equivalent |
| 6 | `ToolMetricsLine` under the error block | `MessageListItem.tsx:187-190`; PocketPal never attributes cost to a failure |
| 7 | Shared `formatToolMetrics` used by chip, surfaces and error alike | `lib/format.ts` |
| 8 | TTS stop state (`VolumeX` / "Stop speaking") | `MessageActions.tsx:86-96` |
| 9 | Pending row exposes `accessibilityRole="progressbar"` and *speaks* elapsed count | `PendingIndicator.tsx:66-84` |
| 10 | Link preview on **assistant** replies | `MessageListItem.tsx:196`; PocketPal restricts it to user rows (`TextMessage.tsx:203-208`) |
| 11 | `AgentStep.ok === false` as a first-class discriminant persisted from a live turn | `lib/chat/turn.ts:191-203` |
| 12 | Regenerate-with host disambiguation (`name (host)`) + active-model check mark | `MessageMenu.tsx:73-86` |
| 13 | Link open guarded by `isOpenableUrl`; failure raises an in-chat warning | `MarkdownView.tsx:120-141` |

---

## 3. Gaps: PocketPal has, LiAI has none

Ordered by user-visible value ÷ effort.

### 3.1 Pending indicator loses the turn's story — **small, high value**
Ours: three dots + wall-clock seconds (`PendingIndicator.tsx:64-100`), with an
explicitly documented decision to omit `Stopping…` (`PendingIndicator.tsx:11-24`).
PocketPal: a **suffix that names the current phase** — `Stopping…` /
`Building page · N tokens · Ns` / `Calculating…` / `Looking up time` /
`Preparing tool` — plus a live token count once `>= 10`
(`PendingIndicator.tsx:17,27-33,128-150`), and it hides during `streaming_text`
(`ChatView.tsx:838-849`).
**Cost:** one phase label per talent + a token count. No architecture change.

### 3.2 Turn-footer metrics — **small**
We show TTFT, tok/s, ms/token (`MessageActions.tsx:118-152`). Missing:
`prompt_per_second`, `cache_n`, draft acceptance. Source:
`AssistantTurnFooter.tsx:53-118,145-155`. Our engine already receives
`tokens_cached` (C3) and timings, so most of this is plumbing, not new data.

### 3.3 Markdown table `align` support — **small**
We render tables in a horizontal ScrollView with a fixed `COLUMN_WIDTH`
(`MarkdownView.tsx:56-59,78-101`); PocketPal honours `align=center|right|left`
(`TableRenderers.tsx:105-160`). Completes deferred issue **09**.

### 3.4 `ContentReportSheet` — **medium**
"Report Content" menu action + a 5-category sheet with a description field, an
include-model-info switch and submit (`ContentReportSheet.tsx:24-215`, wired at
`ChatView.tsx:669-742`). Needs an endpoint or a mail/share fallback.

### 3.5 `IncreaseContextSheet` — **medium**
A context ladder with a RAM estimate and **fits / tight / won't-fit** per stop
(`fitStatus.ts`, `IncreaseContextSheet.tsx`). We show sizes only and document why
(`ContextFullBanner.tsx:114-124`). Our `estimateModelMemory` already exists, so
the estimate side is cheap; the ladder UI is not.

### 3.6 Context banner variants — **small-medium**
PocketPal resolves five: `context-warning`, `context-full`,
`context-remote-hedged`, `html-soft-cap`, plus escalation after
`consecutiveFullFailures >= 2` (`BannerRow.tsx:76-243`). We have two
(`ContextFullBanner.tsx:24-104`).

### 3.7 `HtmlPreviewBubble` — **mechanism settled (WebView), producer still missing**
WebView HTML rendering: JS disabled by default with a strict CSP, toggle to
highlighted source, copy HTML, fullscreen modal with JS enabled
(`HtmlPreviewBubble.tsx:29-338`), wired through a talent surface
(`RenderHtmlTalentUI.tsx:13-18`). `react-native-webview` is the accepted
mechanism (§7.1); **no producer exists on our side** — we have no `render_html`
talent — so the item stays blocked until one is added.

### 3.8 Multi-block-per-row rendering — **large, architectural**
Reasoning → text → tool → text interleaved within one turn. Today our data model
cannot express it: `message.reasoning` is one string and tools live inside the
text bubble. This touches `AgentStep`, `ChatMessage`, `lib/chat/turn.ts`, the
session store and every message renderer. It also subsumes 3.7's plumbing (a
talent surface becomes a sibling block rather than an inline row).

### 3.9 Smaller items
- `StatusIcon` seen / delivered / **error** states on user rows (`StatusIcon.tsx:15-68`); ours tracks only `sending`/`sent` (`lib/chat/rows.ts:11-14`).
- `ImageMessage` + gallery `ImageView`, `FileMessage` row types.
- `GreetingBubble` (`ChatView.tsx:874-894`).
- Pal-driven suggested prompts; ours is a hard-coded 3-item array (`SuggestedPrompts.tsx:12-17`).
- `TalentUIRegistry` with a `renderPending()` hook (`RenderHtmlTalentUI.tsx:20-25`) — 3.1 and 3.7 both want this shape.
- `derivedText()` joins per-step content so Copy/TTS see the whole turn (`utils/chat.ts:32-39`) — moot until 3.8.
- **i18n**: every string routed through `l10n` + `locales/*.json`, 20+ languages.
- Per-token yield (`setTimeout(0)` in the token chain) vs our 100ms macrotask beat.
- Inverted list + `initialNumToRender: 10` windowing; ours uses normal order and FlatList defaults.

---

## 4. Deliberate divergences (leave alone)

| Divergence | Why it's fine |
| --- | --- |
| Markdown selectable on/off | Opposite calls, both defensible; ours is the better one |
| h1–h6 scale vs PocketPal's unstyled defaults | Ours is pinned to DESIGN.md |
| Link preview on assistant replies | Ours is strictly more capable |
| `Stopping…` omitted | Documented choice (`PendingIndicator.tsx:11-24`) — revisit only if 3.1 lands |
| Metrics under error blocks | PocketPal's omission is arguably a gap, not a standard |
| Timestamps on assistant messages | Ours shows time + app header per group; PocketPal shows no time at all |

---

## 5. Deferred ledger — closure status

| Item | Status |
| --- | --- |
| **09** markdown tables | **Effectively closed.** Tables render (`MarkdownView.tsx:56-101`); only `align` is missing → §3.3 |
| **13** tool metrics footer | **Closed.** `ToolMetricsLine` (`toolSurfaces.tsx:53-64`), suppressed at zero via `formatToolMetrics` |
| **04** streaming macrotask yield | **Closed, different mechanism.** 100ms macrotask beat held for the streaming span (`store/chat/send.ts:58-74,186`) vs PocketPal's per-token `setTimeout(0)` |
| **11** session bulk actions | **Closed** (this session's drawer work) |
| **10** date grouping | **Closed** (`lib/chat/session-groups.ts`) |
| **14** lazy message hydration | **Open.** We use FlatList defaults; PocketPal sets `initialNumToRender:10`, `maxToRenderPerBatch:6` (`ChatView.tsx:931-932`) |

---

## 6. Recommended port order

Cheap, high-value first; each is independently shippable.

1. **3.1** pending phase labels + token count — the pending row currently tells the user nothing about what the model is doing.
2. **3.3** table `align` — finishes issue 09.
3. **3.2** footer metrics (`prompt_per_second`, `cache_n`) — data already arrives.
4. **3.6** context-banner variants (remote-hedged + escalation).
5. **3.5** `IncreaseContextSheet` — reuses `estimateModelMemory`.
6. **3.4** `ContentReportSheet`.
7. **3.8** multi-block rows — **only** once 3.7's fate is settled, since it changes where a talent surface lives.
8. **3.7** `HtmlPreviewBubble` — mechanism settled (WebView); blocked only on a `render_html` producer (§7.1).

---

## 7. Resolved / open questions

1. **HTML preview (§3.7) — mechanism decided: `react-native-webview`.
   `@expo/html-elements` is rejected and out of the plan.** It is not a WebView
   substitute: its peers are `react` / `react-native` / `react-native-web` only
   (`expo/expo:packages/html-elements/package.json`), it renders HTML elements as
   native views, ships no HTML parser, and cannot run JS — so it also cannot do
   pocketpal's fullscreen-with-JS mode (`HtmlPreviewBubble.tsx:29-338`).
   **Install `react-native-webview` via `npx expo install react-native-webview`
   (let Expo pick the SDK-57 version), in the SAME commit as the feature — not
   ahead of it.** Still unresolved, and it gates the whole item: **we have no
   `render_html` talent**, so a WebView on its own renders nothing. The bubble is
   useless until something produces HTML.
2. **Multi-block rows?** 3.8 is a data-model change to `AgentStep`/`ChatMessage`,
   not a UI task. Worth its own ticket.
3. **i18n — out of scope.** Pocketpal routes every string through `l10n` +
   `locales/*.json` (20+ languages). LiAI stays English-only. Not a gap to
   close without a decision to localise the product.