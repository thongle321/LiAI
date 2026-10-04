# PocketPal chat-screen feature audit → LiAI gap report

Investigated: 2026-09-29.
Reference: `pocketpal-ai/` (checked out at `D:\aivision\pocketpal-ai`, read-only).
Ours: `D:\aivision` root app (`app/(drawer)/(tabs)/chat.tsx` + `components/chat/**` + `store/chat/**`).

---

## 1. Scope & method

**What was read (pocketpal-ai, source only):**

- Entry: `src/screens/ChatScreen/ChatScreen.tsx`, `src/components/ChatView/ChatView.tsx`,
  `ChatView/BannerRow.tsx`, `ChatView/ImageView.tsx`, `ChatView/styles.ts`.
- Header: `components/ChatHeader/*`, `components/ChatHeaderTitle/*`, `components/HeaderRight/*`,
  `components/HeaderLeft/*`, `components/UsageStats/*`.
- Message tree: `components/Message/*`, `components/TextMessage/*`, `components/ThinkingBubble/*`,
  `components/ReasoningBlock/*`, `components/ResponseBubble/*`, `components/LoadingBubble/*`,
  `components/PendingIndicator/*`, `components/GreetingBubble/*`, `components/AssistantTurnFooter/*`,
  `components/StatusIcon/*`, `components/Avatar/*`, `components/Bubble/*`.
- Composer: `components/ChatInput/*`, `components/SendButton/*`, `components/StopButton/*`,
  `components/SuggestedPromptsRow/*`, `components/ChatEmptyPlaceholder/*`,
  `components/ChatGenerationSettingsSheet/*`, `components/CompletionSettings/*`,
  `components/InputSlider/*`, `components/Checkbox/*`.
- Markdown: `components/MarkdownView/*` (MarkdownView, MarkdownProvider, CodeRenderer,
  TableRenderers, tableStyles, styles), `components/CodeBlockHeader/*`.
- Media/attachments: `components/AttachmentButton/*`, `components/ImageMessage/*`,
  `components/FileMessage/*`, `components/EmbeddedVideoView/*`, `components/HtmlPreviewBubble/*`.
- Agent surface: `components/TalentSurface/*`, `components/ToolUsedChip/*`,
  `components/ToolMetricsFooter/*`, `components/ToolErrorBlock/*`,
  `components/WebSearchResultCard/*`, `services/talents/**`, `services/search/**`.
- Session/infra: `hooks/useChatSession.ts`, `hooks/useMessageActions.ts`, `hooks/useDeepLinking.ts`,
  `store/ChatSessionStore.ts`, `store/DeepLinkStore.ts`, `services/DeepLinkService.ts`,
  `repositories/ChatSessionRepository.ts`, `utils/exportUtils.ts`, `utils/importUtils.ts`,
  `utils/keepAwake.ts`, `utils/chat.ts` (consumed via callers), `utils/bannerVariantResolver.ts`,
  `utils/reasoningCapability.ts`.
- Error surfaces: `components/ErrorSnackbar/*`, `components/ModelErrorReportSheet/*`,
  `components/ContentReportSheet/*`, `api/feedback.ts`, `components/IncreaseContextSheet/*`,
  `components/DownloadOverlay/*`.

**Ours, read fully:** `app/(drawer)/(tabs)/chat.tsx`, `components/chat/**` (ChatMenu,
MessageInput, MessageList, MessageListItem, MessageActions, MarkdownView, CodeBlock,
ReasoningBlock, PendingIndicator, UsageStats, SuggestedPrompts, ChatEmptyPlaceholder,
DateHeader, LinkPreview, AssistantAvatar, SessionList), `store/chat/{index,send,sessions,draft,types}.ts`,
`lib/chat/{turn,export,rows,filter,link-preview,usage,attachments}.ts`,
`lib/agent/{runner,registry}.ts`, `lib/inference/sampler.ts`, `types/chat.ts`.

**Read for "already known" (not treated as evidence):** `docs/adr/0005-chat-architecture.md`,
`docs/adr/0012-tinybase-chat-store.md`, `docs/specs/2026-09-24-pocketpal-parity.md`,
`docs/specs/2026-09-27-pocketpal-keyboard-ui-parity.md`.

**Excluded per the brief:** everything under `src/screens/PalsScreen/**`, `PalsSheets`,
`PalsHub`, `PalStore`, `types/pal.ts`, `ChatPalModelPickerSheet`, `PalGenerationSettingsSheet`,
`PalHeaderRight`, `GreetingBubble` (its only source is `activePal.greeting.text`,
`ChatView.tsx:1105-1107`), `SuggestedPromptsRow`'s pal-sourced prompt list (kept only as the
*pattern* for a prompt chip row), `services/tts/**`, `TTSSetupSheet`, `VoiceChip`, `PlayButton`,
`TTSStore`. Also excluded as non-chat surfaces that happen to be reachable from the chat
header: model download/manage (`DownloadOverlay`, `useStorageCheck`, `useMemoryCheck`),
session-list selection mode / bulk actions (`ChatSessionStore.ts:1330-1408`, a separate
screen), hub-run deep links, and the whole benchmark/automation bridge.

**Coupling notes (not counted as gaps):**

- `ChatScreen.tsx:63-72` + `:243-248` — a video-capable pal swaps the whole chat screen for
  `VideoPalScreen`, and `ChatInput.tsx:177-181,392-404,556-584` hides the send button for it.
  Pure pal entanglement.
- `ChatScreen.tsx:145-190` — the "pal declares tools but the model's jinja has no tool slot"
  one-shot warning is pal-gated, but the mechanism (an `ErrorSnackbar` fed by
  `uiStore.setChatWarning`) is generic; counted only as part of Gap G7.
- `ChatInput.tsx:107-113` (pal auto-selects its default model) is pal-gated; skipped.
- `BannerRow`'s heavy-talent variant (`BannerRow.tsx:33-45`, `:211-218`) is a pal-talent
  escalation of the context banner. Counted only as the generic context banner (Gap G1).

**How to re-verify:** every row in §2 cites `file:line` inside `pocketpal-ai/src/…` or the
root app. Open the file at that line. Where a claim depends on a third-party library's
behaviour rather than app code (markdown table rendering), the library file is cited instead.

---

## 2. Feature inventory (pocketpal-ai chat)

### 2.1 Header / navigation

| Feature | Where | User-visible behaviour |
|---|---|---|
| Two-line header title (conversation title + active model name) | `components/ChatHeader/ChatHeader.tsx:36-44`, `components/ChatHeaderTitle/ChatHeaderTitle.tsx:13-33` | Title line = session title (or "New chat"), second line = active model's name, both `numberOfLines={1}`. |
| Header left: menu + title | `ChatHeader.tsx:37-40` | Drawer/menu button then the title block. |
| Dedicated "new chat" button | `components/HeaderRight/HeaderRight.tsx:161-169` (`testID="reset-button"`) | Pencil-in-box icon; calls `chatSessionStore.resetActiveSession()`. Separate from the overflow menu. |
| Overflow menu: Generation settings | `HeaderRight.tsx:180-184` | Opens `ChatGenerationSettingsSheet`. |
| Overflow menu: model picker submenu | `HeaderRight.tsx:185-217` | Every available model as a submenu item, remote ones labelled `name (serverName)` with a cloud icon and a check on the active one. |
| Overflow: Duplicate chat history | `HeaderRight.tsx:218-227` | Forks the session; errors swallowed, menu closes. |
| Overflow: Rename | `HeaderRight.tsx:228-236` + `RenameModal` (`:279-284`) | Inline rename sheet/modal for the session title. |
| Overflow: Delete (destructive) | `HeaderRight.tsx:237-245` + `:75-90` | `Alert.alert` confirm with a destructive style, then `resetActiveSession()` + `deleteSession()`. |
| Overflow: Export submenu — current session / as Markdown / all sessions / **import** | `HeaderRight.tsx:246-273`, `:106-152` | Four items; import calls `importChatSessions()` (`utils/importUtils.ts:177`) and reloads the session list. |
| Header memory sparkline (opt-in) | `HeaderRight.tsx:160`, `components/UsageStats/UsageStats.tsx:31-160` | 40×20 SVG sparkline of device RAM %, sampled every 3 s, tap for a portal tooltip with used/total/percent. Gated on `uiStore.displayMemUsage`. |
| Dynamic-Island-aware header height | `ChatHeader.tsx:24-31` | `hasDynamicIsland` adjusts the status-bar height before `getDefaultHeaderHeight`. |

### 2.2 Message rendering

| Feature | Where | User-visible behaviour |
|---|---|---|
| Date dividers between conversation days | `ChatView.tsx:483` (`calculateChatMessages`), `components/Message/Message.tsx:154-165`, `:295-300` (`showDateHeaders`) | A centred label row between groups; PocketPal passes no `showDateHeaders` from `ChatScreen.tsx`, so it is off by default here. |
| Message grouping + avatar once per group + rounded-corner flags | `ChatView.tsx:838-846`, `Message.tsx:166-172` | `nextMessageInGroup` drives corner radius; avatar shown only on the first row of a group. |
| Per-message press + long-press | `ChatView.tsx:646-661`, `Message.tsx:397-428` | Long-press fires a haptic (`impactLight`) and opens the context menu; short press opens the image gallery for image rows. |
| Bubble width cap 92% / 900 px | `ChatView.tsx:822-828` | Chat never runs edge-to-edge on tablets. |
| Markdown via `marked` → HTML → `react-native-render-html` | `components/MarkdownView/MarkdownView.tsx:31-50` | Memoised `marked()` → `RenderHTMLSource`, tags/styles/renderers hoisted to a provider at the app root (`MarkdownProvider.tsx`). |
| Markdown tables (custom element models + renderer) | `components/MarkdownView/TableRenderers.tsx:29-46` (models), `:116-170` (renderer), `:173-175` | `table/thead/tbody/tr/th/td` re-registered as block elements; rendered as a horizontally scrollable, cell-bordered grid with header emphasis and `align` support. |
| Code blocks with language header + copy | `components/MarkdownView/CodeRenderer.tsx:39-75`, `components/CodeBlockHeader/*` | `atomOneDark` highlighting, language chip + copy button, raw-HTML entity decoding and newline preservation pulled from `tnode.init.domNode.rawHTML`. |
| Reasoning ("thinking") block: 3-state collapse | `components/ReasoningBlock/ReasoningBlock.tsx:26-79` + `components/ThinkingBubble/ThinkingBubble.tsx:37-330` | Starts PARTIAL (150 px, `MaskedView`+gradient fade, auto-scrolling); tap cycles COLLAPSED → PARTIAL → EXPANDED; auto-collapses on a rising edge once content starts, unless the user already tapped (`userToggledRef`). |
| Multi-block assistant turn (reasoning / content / tools interleaved per step) | `Message.tsx:257-390` | One FlatList row emits N blocks: reasoning first, then text, then a `TalentSurface` per step with tool calls; author header shown once. |
| Assistant turn footer: timings, copy, interrupted/truncated, draft acceptance | `components/AssistantTurnFooter/AssistantTurnFooter.tsx:30-129` | Copy icon; `ms/token`, `tokens/s`, `TTFT` string; `draft accepted X/Y (Z%)`; "Interrupted" or "Cut off" when the turn was stopped/truncated (suppressed when the context-full banner owns the turn). |
| Delivery status icon on user turns | `components/StatusIcon/StatusIcon.tsx:14-77`, `Message.tsx:420-427` | `sent`/`delivered`/`seen`/`sending`/`error` glyphs under the user's own bubbles. |
| Link preview under a message | `components/TextMessage/TextMessage.tsx:203-227` | `@flyerhq/react-native-link-preview` for legacy text rows; email/URL auto-linking via `ParsedText`. |
| Image thumbnails inside a user message + tap-to-enlarge modal | `TextMessage.tsx:158-176`, `:230-247` | Horizontal thumbnails; tapping opens a transparent full-screen `Modal` with a close button. |
| Empty-state placeholder with three states | `components/ChatEmptyPlaceholder/ChatEmptyPlaceholder.tsx:38-100` | "getting ready" (download in flight, no button) / "no models" (→ Models screen) / "activate model" (→ in-chat picker). Renders an empty `<View/>` when a model is already active. |
| Suggested-prompt chips | `ChatView.tsx:1180-1200`, `components/SuggestedPromptsRow/SuggestedPromptsRow.tsx:31-73` | Horizontal chip row above the composer; tap sends the prompt verbatim. |

### 2.3 Input / composer

| Feature | Where | User-visible behaviour |
|---|---|---|
| Text field + always-visible send / stop swap | `components/ChatInput/ChatInput.tsx:223-253`, `:565-585`; `components/SendButton/*`, `components/StopButton/*` | Send button is present even when empty (`sendButtonVisibilityMode="always"`, `ChatScreen.tsx:257`) but dimmed to 0.4 opacity; stop replaces it while inferencing. |
| Blocked-send feedback with haptic | `ChatInput.tsx:228-240` | `notificationWarning` haptic + a 3-second "cannot send without model" helper line instead of sending. |
| Thinking toggle pill, off→effort cycle | `ChatInput.tsx:588-640`; `ChatScreen.tsx:196-236`, `:261-268` | An `AtomIcon` pill in the left control group. Effortless models toggle on/off; graded models cycle `off → low → … → high → off` and the label shows the current level. |
| Model-aware placeholder | `ChatScreen.tsx:269-275` | "Loading model…" / "Model not loaded" / "Type your message". |
| Image attach: camera + gallery, multi-select, per-image remove | `ChatInput.tsx:255-350`, `:417-441` | Plus button → menu (Camera / Gallery). Gallery uses `selectionLimit: 5` (`:320`); permission prompt via VisionCamera; `disableAutoRelease('camera-photo'|'image-gallery')` around the picker so the model isn't freed mid-pick; horizontal preview strip with per-image ✕. |
| Edit mode: banner, autofocus, cancel, commit-on-send | `ChatInput.tsx:184-204`, `:390-408`, `:493-506`; `ChatView.tsx:513-517`, `:524-528` | A spring-animated "Editing message" bar with ✕; the field autofocuses; sending commits the edit (truncating history from that message) then sends. |
| Composer height drives three consumers | `ChatView.tsx:350-352`, `:962-964`, `:1003`, `:1038-1041`, `:1136-1143`, `:1194` | One `useComponentSize` measurement feeds the list margin, the inverted-list spacer, the scroll-to-bottom button and the prompts overlay. |
| Deep-link prefill | `ChatScreen.tsx:254-255`, `ChatView.tsx:369-376`; `store/DeepLinkStore.ts:12-27` | `initialInputText` fills the field once, then calls `onInitialTextConsumed`. |
| Voice chip (excluded) | `ChatInput.tsx:556-558` | — |

### 2.4 Generation controls

| Feature | Where | User-visible behaviour |
|---|---|---|
| Session vs Preset source switch | `components/ChatGenerationSettingsSheet/ChatGenerationSettingsSheet.tsx:98-118`, `:276-330` | Segmented control above the card. With a pal it is Pal/Custom; without one, session-vs-preset is implicit. |
| Full completion-parameter set | `components/CompletionSettings/CompletionSettings.tsx:36-197` | `n_predict` (Unlimited/Custom + numeric field), `include_thinking_in_context` switch, temperature, top_k, top_p, min_p, xtc_threshold, xtc_probability, typical_p, penalty_last_n/repeat/freq/present, mirostat Off/v1/v2 (+tau/eta when >0), seed, jinja. |
| Numeric validation on save | `ChatGenerationSettingsSheet.tsx:172-221` | Numeric coercion + `validateCompletionSettings`, then one Alert listing every offending field; sheet stays open. |
| Reset (session) → preset / system defaults; (preset) → defaults | `ChatGenerationSettingsSheet.tsx:30-78`, `:236-249` | Reset edits the draft only; Save commits. |
| Save / Save as preset | `ChatGenerationSettingsSheet.tsx:222-235`, `:252-262` | "Save as preset" writes the session values onto the global preset, then confirms with an Alert. |
| Reasoning capability resolution (fail-open on unknown) | `utils/reasoningCapability.ts`, consumed at `ChatScreen.tsx:104-114` | Decides whether the pill appears and which effort values it cycles. |
| Effort persisted on both the flag and the reasoning carrier | `ChatScreen.tsx:196-208` | Writes `enable_thinking` *and* `reasoning: {enabled, effort}` so the remote wire path honours OFF too. |

### 2.5 Session management

| Feature | Where | User-visible behaviour |
|---|---|---|
| Per-session composer draft, autosaved on session switch | `ChatView.tsx:370-388`; `store/ChatSessionStore.ts:1419-1433` | `__new_chat__` slot for the unsent conversation; save on leave, restore on enter. In-memory only, not persisted to the DB. |
| Edit mode store surface | `store/ChatSessionStore.ts:1223-1261` | `enterEditMode` / `exitEditMode` / `commitEdit`. |
| Branch-truncating regenerate / try-again | `hooks/useMessageActions.ts:59-104`; `store/ChatSessionStore.ts:1271-1305` | `removeMessagesFromId(id, true)` deletes the message and everything after it from the DB, then re-sends. |
| Long-press context menu | `ChatView.tsx:664-742` | Copy · Regenerate · **Regenerate with…** (model submenu) · Edit (user rows only) · Report content. |
| Rename / duplicate / delete session | `HeaderRight.tsx:93-104`, `:218-245` | See §2.1. |
| Export / import sessions | `utils/exportUtils.ts:37-112`, `:279-353`; `utils/importUtils.ts:177-287` | JSON, Markdown, all-sessions JSON, and validated JSON import. Android writes to Downloads with an explicit storage-permission path; iOS shares directly. |
| Context-full snapshot recorded per turn | `hooks/useChatSession.ts:244-262`, `:426-462`, `:766-766`, `:839-848`, `:882-889` | `contextFull` frozen as `result.context_full \|\| result.truncated \|\| (remote && stopped_limit===1)`; the native "Context is full" throw is string-matched as an equivalent. |
| Reset clears banner state | `ChatSessionStore.ts:1294-1300` | Editing/regenerating clears `lastCompletionResult`, dismissals and the consecutive-failure counter. |

### 2.6 Attachments / media

| Feature | Where | User-visible behaviour |
|---|---|---|
| Multi-image user messages as OpenAI array content | `hooks/useChatSession.ts:74-102` | `[{type:'text'}, {type:'image_url'…}]` when multimodal is on; a `createMultimodalWarning` chat warning when images are attached to a non-vision model. |
| Images ride the Text row, not a separate Image row | `hooks/useChatSession.ts:106-110` (filter `msg.type !== 'image'`) | Deliberate: the multimodal turn keeps images on the row. |
| Gallery viewer on image tap | `ChatView.tsx:599-624`, `:1221-1226`; `ChatView/ImageView.tsx:10-12` | `ImageView` is **a stub returning `<View/>`** — the ChatView gallery path is dead. The *working* enlarge path is `TextMessage`'s own modal (§2.2). |
| HTML preview bubble (JS-off in row, JS-on fullscreen) | `components/HtmlPreviewBubble/HtmlPreviewBubble.tsx:131-245`, `:250-268`, `:290-380`; registered at `services/talents/RenderHtmlTalentUI.tsx` | CSP `default-src 'none'` WebView, copy-HTML, toggle preview↔highlighted source, fullscreen modal with JS enabled, auto-dismissed on blur. |
| `AttachmentButton`, `ImageMessage`, `FileMessage`, `EmbeddedVideoView` | `components/index.ts:2,20,23,33,20` | Exported but **not rendered by ChatView** — no importers outside their own folders. `EmbeddedVideoView` is the video-pal surface. |

### 2.7 Agent tools

| Feature | Where | User-visible behaviour |
|---|---|---|
| Structured tool outcomes (typed result union) | `services/talents/types.ts`, `components/TalentSurface/TalentSurface.tsx:36-101` | Four dispatch cases per call: error → `ToolErrorBlock`; registered TalentUI → its result + `ToolMetricsFooter`; otherwise `ToolUsedChip`; no outcome yet → nothing (the list's PendingIndicator covers it). |
| `ToolUsedChip` with inline metrics | `components/ToolUsedChip/ToolUsedChip.tsx:33-77` | Wrench icon + "Used X", with `· N tokens · Ss` appended when metrics exist. |
| `ToolMetricsFooter` | `components/ToolMetricsFooter/ToolMetricsFooter.tsx:30-52` | `N tokens · Ss` under a talent result; renders nothing at 0 tokens. |
| `ToolErrorBlock` | `components/ToolErrorBlock/ToolErrorBlock.tsx:27-63` | Alert icon + "X failed" + the error message, inline. |
| Web-search result card + results sheet | `components/WebSearchResultCard/WebSearchResultBubble.tsx:21-83`, `WebSearchResultsSheet.tsx:23-130`; `services/talents/WebSearchTalentUI.tsx:6-16` | A tappable "Searched *q* · N results ›" row opening a 60 % sheet of title/url/snippet rows; only `^https?://` URLs are tappable; a snackbar covers open failures. |
| Pending indicator with talent label / token count / elapsed | `components/PendingIndicator/PendingIndicator.tsx:103-172` | Three dots plus `"Building page · 1,240 tokens · 4s"`; `"Stopping…"` overrides everything while stopping; counts hidden below 10 tokens (`:16`). |
| Per-turn max-tool-turns budget | `hooks/useChatSession.ts` → `services/agent` (`DEFAULT_MAX_TURNS`), `store/ChatSessionStore` `hitMaxTurns` metadata | Logs a warning when the chain is cut short. |
| Yield to the macrotask queue every 100 ms | `useChatSession.ts:717-745` | Keeps touch events dispatchable during long streams. |
| Search budget + LRU cache | `services/search/searchBudget.ts` | Clips result counts and caches across turns. |

### 2.8 Export / share

See §2.5 and §2.1. Format-level details worth recording: Markdown export normalises the
title to a single line so a multi-line user title cannot forge a heading
(`exportUtils.ts:296-301`), reverses the newest-first repository array into chronological
order (`:314-316`), and records attachments as `_[image]_` while dropping the temp-dir URI
(`:318-330`).

### 2.9 Error & edge states

| Feature | Where | User-visible behaviour |
|---|---|---|
| Typed `ErrorState` + `ErrorSnackbar` with per-code icon/action/duration | `components/ErrorSnackbar/ErrorSnackbar.tsx:26-124` | Icon by code (`wifi-off`, `harddisk-remove`, `server-off`, `image-off-outline`, auth variants); action is Add-Token / Settings, Report (modelInit), Retry (recoverable) or Dismiss; 8 s / 20 s / 10 s durations by severity and code. |
| Model-load error report sheet | `components/ModelErrorReportSheet/ModelErrorReportSheet.tsx:33-286`, `api/feedback.ts:227-330` | Three opt-in groups (model info, raw `ContextParams` JSON, device info), a free-text field, posted to their feedback endpoint behind Firebase App Check. |
| Content report sheet (from the long-press menu) | `components/ContentReportSheet/ContentReportSheet.tsx:46-224` | Category picker (hate/sexual/selfHarm/violence/other) + description + optional model info, with validation, success and error Alerts. |
| Context banners: warning / remote-hedged / full / html soft-cap | `components/ChatView/BannerRow.tsx:66-240`; resolved in `utils/bannerVariantResolver.ts` | One sticky banner slot above the composer with a fill meter, `%` readout, "More room" / "New chat" / "Dismiss" actions, and variant-specific copy (remote vs heavy-talent vs escalated after ≥2 consecutive full failures). |
| Increase-context sheet with per-stop fit status | `components/IncreaseContextSheet/IncreaseContextSheet.tsx:36-330`, `fitStatus.ts:15-45`; gated at `ChatView.tsx:299-331` | Slider over `CONTEXT_LADDER` capped at the GGUF-trained length, showing ≈words, RAM estimate, a fits/tight/won't-fit chip tinted by risk, the furthest fitting stop, and a reload-and-roll-back-on-failure path. Offers "New chat" instead of a dead Confirm when nothing fits. |
| Reload feedback snackbar (indefinite → timed) | `ChatView.tsx:1272-1288` | One snackbar that stays up while reloading and auto-hides 4 s after the result. |
| Interrupted / truncated turn metadata | `useChatSession.ts:790-826`; rendered by `AssistantTurnFooter.tsx:38-46,120-128` | Stop preserves partial steps and marks them; truncation is a distinct "Cut off" label. |
| Speculative-init and tool-arg-parse error copy | `useChatSession.ts:760-772`, `:876-882` | Friendly system messages instead of multi-KB native error dumps. |

### 2.10 System behaviours

| Feature | Where | User-visible behaviour |
|---|---|---|
| Keep-awake during a turn | `utils/keepAwake.ts:5-19`, `hooks/useChatSession.ts:557-561`, `:893-897`, `:928-934` | Screen is held awake from send until the run finishes — **or until the user presses Stop**, deliberately released early on stop. |
| Single reconciled keyboard-occlusion value | `ChatView.tsx:411-426` | `max(0, abs(keyboard.height) - insets.bottom)`, consumed by the input, the prompts overlay and the list spacer so they cannot disagree. |
| Platform-gated interactive keyboard dismissal | `ChatView.tsx:1014-1016` | `'interactive'` on iOS, `'none'` on Android (Android's interactive mode makes a drag close the keyboard as the only outcome). |
| Scroll-position hysteresis + scroll-to-bottom FAB | `ChatView.tsx:448-495`, `:1030-1055` | `STICK=24 / LEAVE=40`; the FAB fades/slides in only when there is overflow and the reader has actually left the end. |
| `maintainVisibleContentPosition` while streaming | `ChatView.tsx:1022-1028` | `{autoscrollToTopThreshold: 20, minIndexForVisible: 1}` so the growing bubble doesn't shove the reader. |
| Auto-scroll on new user message | `ChatView.tsx:568-581` | Scrolls to offset 0 (inverted list) when the newest message is the user's. |
| Deep-link service with iOS Shortcuts support | `hooks/useDeepLinking.ts:28-77`, `services/DeepLinkService.ts`, `store/DeepLinkStore.ts` | Cold + warm URL handling; a `?message=` param parks a prefill for the composer. |
| Conditional sheet mounting to dodge keyboard fights | `ChatView.tsx:1204-1210` | The picker sheet is *mounted* only while open, not hidden — "better than the keyboard issue". |
| Load-free safety rails around the picker | `ChatInput.tsx:265-276`, `:326-349` | `disableAutoRelease` around camera/gallery so the model isn't evicted mid-pick. |

---

## 3. Comparison against our app

Status key: **Present** / **Partial** / **Missing**.

### 3.1 Header / navigation

| Feature | Status | Evidence in our app |
|---|---|---|
| Conversation title + model name in the header | **Missing** | `app/(drawer)/(tabs)/chat.tsx:206-219` renders the `APP_NAME` wordmark only; the title is a `<Pressable>` that navigates to `/models`. No session title, no active-model name anywhere in the header. |
| New-chat button | Present | `chat.tsx:226-237` (`SquarePen` → `newConversation()`). |
| Generation settings menu row | Present | `components/chat/ChatMenu.tsx:216-221`. |
| Model picker submenu (local + remote, active marker) | Present | `ChatMenu.tsx:222-226`, `:254-281` — downloads and remote APIs listed, "Active" value + chevron. |
| Duplicate / Rename / Delete | Present | `ChatMenu.tsx:236-266`; wired to `store/chat/sessions.ts:157-197`. Rename is an inline panel in the menu (`ChatMenu.tsx:309-333`). Delete has no confirm Alert (pocketpal does, `HeaderRight.tsx:75-90`). |
| Export: current / markdown / all | Present | `ChatMenu.tsx:283-300` → `lib/chat/export.ts:60-113` → `lib/chat/share-export.ts`. |
| **Import** sessions from a JSON file | **Missing** | No `expo-document-picker` read path, no validator. `grep` for `importChatSessions`/`validateImportedData` equivalents: nothing in `store/chat/*` or `lib/chat/*`. Only export exists. |
| Header memory sparkline | **Missing** | Nothing device-memory-related on the chat screen; `components/chat/UsageStats.tsx` is a *token* aggregate, not the sparkline. |
| Dynamic-Island header compensation | Present (implicitly) | `chat.tsx:186-189` uses a fixed 56 px header inside a `SafeAreaView edges={["top","left","right"]}`. |

### 3.2 Message rendering

| Feature | Status | Evidence in our app |
|---|---|---|
| Date dividers | Present | `components/chat/DateHeader.tsx`, wired in `chat.tsx:305` and derived in `lib/chat/rows.ts:70-77`. |
| Grouping / avatar-once / corner flags | Present | `lib/chat/rows.ts:80-92`, consumed by `MessageListItem.tsx:76-119`. |
| Long-press context menu | **Missing** | No `onLongPress` handler exists anywhere in `components/chat/**` (grep for `onLongPress` outside tests returns nothing). There is no per-message menu of any kind. |
| Bubble width cap | Present | `MessageListItem.tsx:56` `max-w-[80%]` / `:113` `max-w-[75%]`. |
| Markdown rendering | Present | `components/chat/MarkdownView.tsx:48-110` via `react-native-marked`. |
| Markdown tables | Present | `react-native-marked` ships `dist/commonjs/components/MDTable.js` and `utils/table.js`; our `MarkdownView` uses the default renderer, so tables render natively. No custom styling pass, though — pocketpal's is explicitly styled (`TableRenderers.tsx:116-170`). |
| Code block with language + copy | Present | `components/chat/CodeBlock.tsx:24-62`. |
| Reasoning block, 3-state collapse + auto-collapse | Present | `components/chat/ReasoningBlock.tsx:39-113` — same COLLAPSED→PARTIAL→EXPANDED cycle, same `userToggledRef` rising-edge rule, SVG fade instead of MaskedView. |
| Multi-block interleaved assistant turn | **Partial** | One flat assistant row: reasoning block, then the whole text, then a chip row. `MessageListItem.tsx:118-145`. There is no per-step interleaving, so a tool call that lands mid-answer does not appear between the two text segments. |
| Turn footer: copy / timings / interrupted / truncated / draft acceptance | **Partial** | Copy + regenerate + speak exist (`MessageActions.tsx:41-79`); usage renders as `"{n} tokens"` (`MessageListItem.tsx:148`) and again as `"{p} in · {c} out"` (`MessageActions.tsx:72-75`). **Missing:** ms/token, tokens/s, TTFT, interrupted vs "cut off", speculative-draft acceptance. Our engine layer exposes no timings at all (`lib/inference/engine.ts` `CompletionOutcome` carries only token counts). |
| Delivery status icon | Partial | `MessageListItem.tsx:99-105` shows a spinner while the newest user turn is in flight and double-checks after — one binary state. Pocketpal has sent/delivered/seen/error (`StatusIcon.tsx:14-77`). Ours has no error state on a user turn (errors render as a separate card, `:57-73`). |
| Link preview | Present | `components/chat/LinkPreview.tsx:13-66`. |
| Image thumbnail + tap-to-enlarge modal | **Partial** | The image renders inline (`MessageListItem.tsx:81-85`) but is not pressable — no enlarge, no fullscreen viewer. |
| Empty placeholder, three states | Present | `components/chat/ChatEmptyPlaceholder.tsx:16-70`. Diverges deliberately: rendered as an overlay beside the list, not a `ListEmptyComponent` (documented in `chat.tsx:96-102` and `components/chat/MessageList.tsx:14-24`, and in `docs/specs/2026-09-27-pocketpal-keyboard-ui-parity.md` §12). |
| Suggested-prompt chips | Present | `components/chat/SuggestedPrompts.tsx:11-31` (fixed list; pocketpal's are pal-authored). |

### 3.3 Input / composer

| Feature | Status | Evidence in our app |
|---|---|---|
| Always-visible send / stop swap | Present | `MessageInput.tsx:382-405`; send is disabled (Mist fill) rather than hidden. |
| Blocked-send feedback | Present (different mechanism) | The placeholder names the state and the send button disables (`MessageInput.tsx:196-207`, `:398-405`). No haptic, and no transient helper line — a deliberate simplification recorded in the keyboard spec §12. |
| **Thinking toggle pill / effort cycle in the composer** | **Missing** | `useInference` has `thinkingEnabled` and `setThinkingEnabled` (`store/inference.ts:49,112,332`) and it threads into the turn (`store/chat/index.ts:188-192`, `lib/chat/turn.ts:139-141`), but there is **no control in the chat UI** — `MessageInput.tsx`'s control row has only plus / field / mic / send-or-stop (`:344-405`). The only place it can be changed is the Settings screen. And there is no graded-effort concept anywhere (`reasoning_effort` has zero hits outside this doc). |
| Model-aware placeholder | Present | `MessageInput.tsx:196-207`, pocketpal's strings verbatim. |
| Image attach: camera + gallery | Present | `MessageInput.tsx:222-232`, `:305-330`; `lib/chat/attachments.ts`. |
| **Multi-image attach (up to 5)** | **Missing** | `MessageInput.tsx:80` holds a single `attached: string \| null`; `lib/chat/turn.ts:124-127` builds at most one `imagePaths` entry; `types/chat.ts:45` has a single `image?: string`. `pickImage` returns one URI. |
| **Auto-release suspension around the picker** | **Missing** | pocketpal wraps camera/gallery in `disableAutoRelease` (`ChatInput.tsx:265-276`, `:326-349`) so a mid-pick model release can't happen. We have `hooks/useEngineOffload.ts` but the attach path never calls it — an Android model released between opening and returning from the picker would break the turn that follows. |
| Edit mode (edit a sent message, rewind history) | **Missing** | No `isEditMode`, no `editingMessageId`, no `removeMessagesFromId` equivalent. `store/chat/send.ts` `regenerate` (`store/chat/send.ts:200-241`) pops only the last assistant turn (`popLastAssistant`), it cannot truncate an arbitrary point. |
| Composer height driving three consumers | Present | `chat.tsx:141-153` measures once; consumed by the list padding, the jump overlay and the overlay row. |
| Deep-link prefill | **Missing** | No `expo-linking` handler on the chat route; `MessageInput` has no `initialInputText` prop. |
| Haptics on long-press / blocked send | **Missing** | `expo-haptics` is a dependency but is imported only by `hooks/useVoiceLoop.ts`. |

### 3.4 Generation controls

| Feature | Status | Evidence in our app |
|---|---|---|
| Session vs preset | Present | `components/chat/GenerationSettingsSheet.tsx:79-104`, `:196-213`. |
| Full parameter set | Present | `components/SamplerRows.tsx:38-227` — every row pocketpal has, same order, same ranges. |
| Validation on save | Present | `GenerationSettingsSheet.tsx:44-50`, `:117-141` (Alert + inline field marks). |
| Reset to preset / system defaults, Save as preset | Present | `GenerationSettingsSheet.tsx:168-186`, `:218-261`. |
| Reasoning-effort persistence | **Missing** | No `reasoning` carrier on `SamplerParams`; `lib/chat/turn.ts:139-141` passes `enableThinking` as a bare boolean. For a graded model (gpt-oss style) there is no way to pick a level. |

### 3.5 Session management

| Feature | Status | Evidence in our app |
|---|---|---|
| Per-session drafts | Present (stronger) | `store/chat/draft.ts:29-50` + `lib/chat/session-store.ts`; drafts live in the TinyBase store, so they survive a restart. Pocketpal's are in-memory only (`ChatSessionStore.ts:1419-1433`). |
| Long-press menu actions (copy / regenerate / regenerate-with / edit / report) | **Missing** | See 3.2 — the menu itself does not exist. |
| Rename / duplicate / delete | Present | `store/chat/sessions.ts:186-197`. |
| Export (3 kinds) | Present | `lib/chat/export.ts:60-113`. |
| Import | **Missing** | See 3.1. |
| Context-full snapshot per turn | **Missing** | `lib/agent/runner.ts:36-44` `AgentResult` has no `contextFull`; `lib/chat/turn.ts:145-186` records no snapshot. `grep` for `context_full`/`contextFull` across the app (excluding tests) returns nothing. A context overflow surfaces as a generic error card. |
| Deleting a message from the middle | **Missing** | Only `popLastAssistant` exists (`lib/chat/session-store.ts`; used at `store/chat/send.ts:207-212`). |

### 3.6 Attachments / media

| Feature | Status | Evidence in our app |
|---|---|---|
| Multimodal array content | Present (equivalent) | `lib/chat/turn.ts:122-127` + `store/chat/index.ts:163-186` (data-uri → temp file → `imagePaths`). |
| Multimodal-without-vision warning | **Missing** | Sending an image to a non-vision model fails with a raw error; pocketpal raises `createMultimodalWarning` (`useChatSession.ts:92-97`). |
| HTML preview bubble | **Missing** | `render_html` is explicitly out of scope in `docs/specs/2026-09-24-pocketpal-parity.md` §2 (deferred — needs a WebView) and there is no such talent in `lib/agent/registry.ts:30-84`. |
| Gallery viewer | **Missing** | See 3.2. (Note pocketpal's `ChatView/ImageView.tsx:10-12` is a stub too — only `TextMessage`'s modal actually works there, so this is a small gap, not a large one.) |

### 3.7 Agent tools

| Feature | Status | Evidence in our app |
|---|---|---|
| Four talents (datetime, calculate, web_search, read_url) | Present | `lib/agent/registry.ts:30-84`, dispatch `:91-175`; read-url allowlist `lib/agent/allowlist.ts`; untrusted fencing `lib/agent/untrusted.ts`. |
| Tool chips in the bubble | Partial | `MessageListItem.tsx:130-145` renders the bare tool *name* with a wrench. No "Used X" phrasing, no icon container, no tap affordance. |
| **Tool result UI** | **Missing** | Outcomes are plain strings (`lib/agent/registry.ts:91-175` returns `string`), so there is nothing structured to render: no web-search result card / results sheet, no `read_url` extracted-text card, no render_html preview. The search hits exist only as fenced markdown fed back to the model (`registry.ts:135-141`). |
| Tool error block | **Missing** | A failed tool returns a string that starts with the tool name (e.g. `"web_search: no results…"`, `registry.ts:129`) and lands as invisible agent text. No `ToolErrorBlock`. |
| Per-tool metrics (tokens + duration) | **Missing** | `AgentStep` (`types/chat.ts:19-25`) has no `durationMs`/token count, and the store comment says so explicitly ("no status — a call is only ever written once it has finished"). |
| Pending indicator with label / token count / elapsed | **Partial** | `components/chat/PendingIndicator.tsx:41-58` — three dots and nothing else; the file's own header comment (`:7-12`) says the store holds no turn-start stamp. No "Stopping…" state either: `store/chat/send.ts:139-155` clears `sending` synchronously on stop. |
| Max-turn budget | Present | `lib/agent/runner.ts:59,97-101,182-186` with the forced-final nudge. |
| Yield to the macrotask queue | **Missing** | `lib/agent/runner.ts` awaits `engine.completion` and iterates with no periodic yield; the comment at `runner.ts:2-4` claims the pocketpal principles were ported, but this one was not. Risk is much lower for us (one on-device await per turn, no microtask resumption queue). |
| Search budget / LRU cache | Present | `lib/agent/search.ts`, `store/search.ts`. |

### 3.8 Export / share

| Feature | Status | Evidence in our app |
|---|---|---|
| JSON / Markdown / all-sessions share | Present | `ChatMenu.tsx:283-300`, `lib/chat/export.ts`, `lib/chat/share-export.ts`. Our Markdown export additionally pins tool calls under a "Tool calls" heading (`export.ts:52-58`) and escapes the title (`export.ts:30-32`) — both beyond pocketpal. |
| Import | **Missing** | See 3.1. |

### 3.9 Error & edge states

| Feature | Status | Evidence in our app |
|---|---|---|
| Typed error snackbar with per-code icon/action/duration | **Missing** | Errors render as an in-list tappable card (`MessageListItem.tsx:57-73`) with one line of copy and no recovery action. There is no snackbar surface on the chat screen at all. |
| Context warning / full banners with meter | **Missing** | No banner slot above the composer (`chat.tsx:388-398` holds only `SuggestedPrompts` and `UsageStats`). No percentage, no "More room", no "New chat", no dismissal. |
| Increase-context sheet | **Missing** | Nothing. `store/inference.ts:276` `setNContext` exists but is only reachable from the inference settings screen, and nothing estimates whether a larger `n_ctx` fits the device. We do have `lib/models/memoryEstimator.ts` and `lib/chat/index.ts:117-134` wiring `n_ctx` into context init, so the *ingredients* exist. |
| Reload feedback snackbar | Missing | Follows from the above. |
| Interrupted / truncated turn markers | **Missing** | `store/chat/send.ts:139-155` on stop keeps the partial text and stamps `at`, but records nothing that distinguishes "stopped" from "finished". |
| Content report (long-press → Report) | **Missing** | No sheet. It is server-gated on their end too (`api/feedback.ts:62-88`), and ADR-0008 retired our backend, so this is Missing *and* deliberately out of reach. |
| Model-load error report | **Missing** | Same: `ModelErrorReportSheet.tsx` posts to their endpoint behind Firebase App Check; we have no equivalent and no endpoint. |

### 3.10 System behaviours

| Feature | Status | Evidence in our app |
|---|---|---|
| Keep-awake during a turn | **Missing** | `expo-keep-awake` is in `package-lock.json:4250` (transitively, via Expo) but never imported. `grep` for `KeepAwake` across the app returns only the lockfile. `lib/chat/turn.ts` and `store/chat/send.ts` hold no wake lock across the run. |
| Single reconciled keyboard-occlusion value | Present (better) | `hooks/useKeyboardLift.ts` + `lib/keyboard.ts`, documented as a deliberate improvement in `docs/specs/2026-09-27-pocketpal-keyboard-ui-parity.md` §12. |
| Platform-gated interactive dismissal | Present | `components/chat/MessageList.tsx:120-121` — `ios ? "interactive" : "none"`. |
| Scroll hysteresis + jump-to-latest | Present | `MessageList.tsx:37-46`, `:76-113`; `chat.tsx:337-359`. |
| `maintainVisibleContentPosition` while streaming | Present | `MessageList.tsx:145-149`. |
| Auto-scroll on new user message | Present (via row-count follow) | `MessageList.tsx:100-107`. |
| Deep links into chat with a prefill | **Missing** | No `expo-linking` subscription on the chat route. (`expo-linking` is a dependency but used only for opening search results and Settings — `components/chat/LinkPreview.tsx:17`, `MessageInput.tsx:13`.) |
| Sheet unmounting while open | N/A | Our Generation settings sheet is a plain visibility prop (`GenerationSettingsSheet.tsx:96-99`), and it holds no text field at the top, so the pocketpal workaround has no analogue here. |

---

## 4. Gap list (ordered by user impact)

**G1 — Context-full detection and recovery: MISSING.**
PocketPal records a `contextFull` snapshot on every finished turn (`useChatSession.ts:244-262`,
`:426-462`), string-matches the native `"Context is full"` throw (`:765-766`), and renders a
sticky banner with a fill meter, `%`, "More room", "New chat" and "Dismiss"
(`ChatView.tsx:1145-1151` → `BannerRow.tsx:66-240`), backed by `IncreaseContextSheet`
(`IncreaseContextSheet.tsx:36-330`) that reloads the model at a chosen `n_ctx` and rolls back on
failure. We do none of this: `lib/agent/runner.ts:36-44` has no snapshot field, `grep` for
`context_full` in the app returns nothing, and there is no banner slot
(`app/(drawer)/(tabs)/chat.tsx:388-398`). **Consequence:** when a long thread exhausts `n_ctx`,
the user gets one opaque red error card with an engine string and a "tap to retry" that fails
identically forever. PocketPal names the problem, shows how full the context is, and offers two
one-tap ways out.

**G2 — Keep-awake during generation: MISSING.**
`utils/keepAwake.ts:5-19`, activated at send (`useChatSession.ts:557-561`) and released on
completion (`:893-897`) or, deliberately earlier, on Stop (`:928-934`). We never take a wake
lock. **Consequence:** on a long local generation the screen sleeps mid-answer; the user comes
back to a half-rendered bubble and may not know whether the turn finished.

**G3 — Long-press message menu (copy / regenerate / regenerate-with-model / edit / report): MISSING.**
`ChatView.tsx:664-742` builds the menu; `hooks/useMessageActions.ts:33-116` implements copy,
edit, try-again and try-again-with-another-model; `store/ChatSessionStore.ts:1223-1305` supplies
edit mode and history truncation. We have copy and regenerate as always-visible icons under
every assistant bubble (`components/chat/MessageActions.tsx:41-79`) but no menu, no edit, no
cross-model retry. **Consequence:** a user who wants to fix a typo in an earlier question cannot
edit-and-resend — the only way to re-run an earlier question is to retype it. There is also no
"regenerate with a different model", which is pocketpal's cheapest quality lever.

**G4 — Turn observability (timings, interrupted/truncated, draft acceptance): MISSING.**
`AssistantTurnFooter.tsx:56-128` renders ms/token, tokens/s, TTFT, speculative-draft acceptance
and a distinct "Interrupted" / "Cut off" label; `useChatSession.ts:790-826` supplies the metadata.
We render only a token count (`MessageListItem.tsx:148`, `MessageActions.tsx:72-75`), and
`lib/inference/engine.ts`'s outcome carries no timings at all. **Consequence:** a user who
stops a reply sees a bubble that looks exactly like a finished one, and nobody can tell whether
the model is slow, the device is slow, or the answer was cut short.

**G5 — Agent tool results have no UI: MISSING.**
`TalentSurface.tsx:36-101` dispatches each tool outcome into one of four real surfaces:
`WebSearchResultBubble` + `WebSearchResultsSheet` (`WebSearchResultBubble.tsx:21-83`,
`WebSearchResultsSheet.tsx:23-130`), `HtmlPreviewBubble`, `ToolUsedChip`
(`ToolUsedChip.tsx:33-77`), `ToolErrorBlock` (`ToolErrorBlock.tsx:27-63`), each with a
`ToolMetricsFooter` (`ToolMetricsFooter.tsx:30-52`). Ours reduces every outcome to a bare tool-name
chip (`MessageListItem.tsx:130-145`), because `lib/agent/registry.ts:91-175` returns strings, not
typed results. **Consequence:** a web search is invisible — the user sees "web_search" appear
and then has to trust that the answer's citations came from somewhere. A failed tool is invisible
too: `registry.ts:129` returns `"web_search: no results for …"` as agent-facing text, and the
bubble just looks like the model changed its mind.

**G6 — In-composer thinking toggle and graded reasoning effort: MISSING.**
`ChatInput.tsx:588-640` renders the pill; `ChatScreen.tsx:196-236` cycles effort levels and
persists them on both `enable_thinking` and a `reasoning` carrier so remote models honour OFF.
We have the *state* (`store/inference.ts:49,332`) and it reaches the engine
(`store/chat/turn.ts:139-141`), but the chat screen's control row
(`MessageInput.tsx:344-405`) has no pill at all — the only way to turn thinking off is to leave
the chat screen and find it in Settings, mid-conversation. Graded effort has no representation
anywhere. **Consequence:** a reasoning model burns 2–5× the tokens and seconds on every reply
with no in-place escape, and users on slow hardware cannot trade quality for speed mid-thread.

**G7 — No error snackbar surface on chat: MISSING.**
`ErrorSnackbar.tsx:26-124` gives every typed error an icon, a *recovery action* (Add Token,
Report, Retry) and a severity-scaled duration; `ChatScreen.tsx:281-296` mounts two of them
(chat warning + model-load error). We have one shape: a tappable error card with a single line of
copy and no action (`MessageListItem.tsx:57-73`). **Consequence:** recoverable failures (no
search key, multimodal on a text-only model, a transient engine fault) are indistinguishable
from fatal ones, and the user is never offered the retry or the fix.

**G8 — Multi-image attachment (up to 5): MISSING.**
`ChatInput.tsx:320` (`selectionLimit: 5`), preview strip at `:417-441`, and array content at
`useChatSession.ts:74-102`. Ours is structurally single-image: `MessageInput.tsx:80` holds one
`string | null`, `types/chat.ts:45` has one `image?`, `lib/chat/turn.ts:124-127` builds at most
one path. **Consequence:** "compare these two screenshots" is not expressible.

**G9 — Send-with-no-model feedback is weaker: PARTIAL.**
PocketPal fires a warning haptic and a temporary helper line (`ChatInput.tsx:228-240`); ours only
disables the button and changes the placeholder (`MessageInput.tsx:196-207`). Partly deliberate
(`docs/specs/2026-09-27-pocketpal-keyboard-ui-parity.md` §12 argues the placeholder is the honest
single surface) — but the *haptic* half is not recorded anywhere as rejected, and we have
`expo-haptics` installed and unused outside voice.

**G10 — Session import: MISSING.**
`HeaderRight.tsx:260-272` → `utils/importUtils.ts:177-287` (document picker, schema validation,
partial-import count, list refresh). We export three ways and cannot read any of them back.
**Consequence:** a user who backs up the app has no supported restore path; the only recovery is
the SQLite file.

**G11 — Header shows the app name, not the conversation: MISSING.**
`ChatHeaderTitle.tsx:13-33` renders the session title and the active model name. Ours renders
`APP_NAME` (`chat.tsx:213`) — **the active model name appears nowhere on the chat screen.**
**Consequence:** after switching models from the menu, nothing on screen confirms which model is
answering; the user has to open the menu or leave for `/models`.

**G12 — Multimodal-on-a-text-model warning: MISSING.**
`useChatSession.ts:92-97` raises `createMultimodalWarning` instead of failing. Our path writes
the image and hands it to the engine regardless (`store/chat/index.ts:163-186`), and the engine
error becomes a generic card. **Consequence:** a confusing engine error instead of "this model
can't see images".

**G13 — Pending indicator carries no progress signal: PARTIAL.**
`PendingIndicator.tsx:103-172` shows `"Building page · 1,240 tokens · 4s"`, and `"Stopping…"`
while the runner winds down (`:139-141`). Ours is three dots (`PendingIndicator.tsx:41-58`), and
`store/chat/send.ts:139-155` clears `sending` synchronously on stop so there is no stopping state
to show. **Consequence:** during a long tool call or a slow first token the screen looks frozen;
the file's own comment admits there is nothing honest to display.

**G14 — Attach/picker does not suspend engine auto-release: MISSING.**
`ChatInput.tsx:265-276` and `:326-349` bracket the camera and gallery with
`disableAutoRelease('camera-photo'|'image-gallery')`. Our attach path never touches
`hooks/useEngineOffload.ts`. **Consequence:** on Android, a model released while the OS picker is
in the foreground turns the next send into a load-then-fail. This is a latent Android-only bug,
not a cosmetic gap.

**G15 — Image tap does not enlarge: PARTIAL.**
Working in pocketpal at `TextMessage.tsx:230-247` (their `ChatView/ImageView.tsx:10-12` is a
stub, so only the `TextMessage` path counts). Ours renders the image inert
(`MessageListItem.tsx:81-85`). **Consequence:** a photo you just took is stuck at 160×120 px;
you cannot check whether you photographed the right thing before sending it.

**G16 — Deep-link prefill into the composer: MISSING.**
`ChatScreen.tsx:254-255` + `DeepLinkStore.ts:12-27` park a `?message=` and fill the field once.
We have no chat-route link handler. (pocketpal's link is pal-keyed, so this is coupled — but the
*prefill* mechanism is generic.)

**G17 — Content / model-error reporting: MISSING and unreachable.**
`ContentReportSheet.tsx:46-224` and `ModelErrorReportSheet.tsx:33-286` both POST to their
feedback endpoint behind Firebase App Check (`api/feedback.ts:62-88`, `:227-330`). ADR-0008
retired the LiAI backend, so there is nowhere to post and no identity to attribute a report to.
Listed for completeness, not as actionable work.

---

## 5. Already tracked / deliberately deferred

| Item | Where it is recorded | Note |
|---|---|---|
| Keyboard architecture, `KeyboardChatScrollView`, jump-to-latest, empty-state placement, `keyboardDismissMode` gating, `freeze`, `scrollToEnd`-on-ref | `docs/specs/2026-09-27-pocketpal-keyboard-ui-parity.md` §12, §13 | Fully implemented in our code (`MessageList.tsx:120-121`, `chat.tsx:337-359`, `chat.tsx:96-102`). Not gaps. |
| `render_html` talent and its HTML preview bubble | `docs/specs/2026-09-24-pocketpal-parity.md` §2 ("Explicitly out of scope … `render_html` talent (deferred — needs a WebView)") | Deliberate. Covered by G6-adjacent note only; I have **not** counted it as a standalone gap. |
| Pals, greetings, pal-authored suggested prompts, pal settings source | same spec §2 | Excluded by the brief. |
| Benchmark / hub-run deep links, checkout, devtools | same spec §2 | Excluded. |
| Theme switcher, language switcher | same spec §2 | Excluded (light-locked, English-only). |
| Markdown via `react-native-marked` instead of `marked` + HTML renderer | `docs/adr/0005-chat-architecture.md` "Markdown uses react-native-marked"; spec §5 | A deliberate architecture divergence, not a gap. It does mean pocketpal's custom **table styling** (`TableRenderers.tsx:116-170`) is not reproduced — noted under 3.2, not counted as a gap. |
| Sessions in a local TinyBase + SQLite store, no backend | `docs/adr/0012-tinybase-chat-store.md` | Explains why §G17 (server-backed reporting) is unreachable. |
| The `GenerationSettingsSheet` has no "enable thinking" row | `components/chat/GenerationSettingsSheet.tsx:20-26` header comment | The row is deliberately absent because pocketpal keeps it as a composer pill — **and we have not built that pill either** (G6). The comment currently describes an unbuilt counterpart as if it were pocketpal's job. |
| The keyboard spec's "no in-composer prompt or button" decision | `app/(drawer)/(tabs)/chat.tsx:88-95` | Records that the models screen is reached from the header wordmark — which is also why the header cannot double as a model-name display (G11). |

**One spec claim the code does not support.** `docs/specs/2026-09-24-pocketpal-parity.md` §2
lists "Session mgmt, copy/regenerate, prompts, usage, export, search-in-chat" as **Wave 1
complete**, and §6 puts "export, in-chat search" in Wave 5. Only *export* and *in-chat search*
shipped; **session import** (G10) was never in the wave table at all, and neither was any of the
error/reporting surfaces. The wave table reads as if the non-chat parity surface is finished; it
is not, and this document's §4 is the first place the remaining items are enumerated.

---

## 6. Open questions

1. **`contextFull` detection on our engine.** `lib/inference/engine.ts` `CompletionOutcome` does
   not surface `context_full` / `truncated` / `stopped_limit`, so G1's first step is a question
   for `lib/inference/local-engine.ts` (llama.rn/QVACK): does the underlying completion result
   expose those flags, or would we have to string-match the throw the way pocketpal does
   (`useChatSession.ts:765`)? The string-match route is known-fragile — pocketpal's own comment
   labels it `LLAMARN-DEP`.
2. **Does `n_ctx` reload mid-session actually work for us?** `store/chat/index.ts:110-160`
   caches the loaded context in `EngineManager`, so `IncreaseContextSheet`'s release → setNContext →
   re-init sequence would need a real release path there. `store/inference.ts:276` sets the value
   but nothing reloads. Unverified.
3. **Memory estimator fidelity.** `lib/models/memoryEstimator.ts` exists and is wired into context
   init, but I did not verify it produces the same fits/tight/won't-fit tiers pocketpal's
   `fitStatus.ts:15-45` needs, nor whether `largestSuccessfulLoad`-style calibration exists in our
   model store at all. It may not, which would make the "fits" chip meaningless.
4. **Tool outcome shape.** G5's fix depends on whether we widen `AgentStep.result` from `string`
   to a typed union (`types/chat.ts:19-25`) or add a parallel field. `lib/chat/tinybase-store.ts`
   persists `toolRuns` rows, so a shape change has a migration cost I have not sized.
5. **Long-press vs. always-visible actions.** PocketPal's copy/regenerate live behind a long-press
   menu; ours are always visible. If we add the menu, do we *move* the existing two into it, or
   keep both? That is a design call, not an audit finding.
6. **Whether `expo-keep-awake` is a direct dependency.** It appears in `package-lock.json:4250`
   but not in `package.json` — so G2 needs a dependency decision (it is first-party Expo, so
   almost certainly fine, but `AGENTS.md` requires asking before adding anything).
7. **Deep links are pal-keyed upstream.** I could not determine from code whether the prefill
   mechanism (G16) is worth extracting without the pal half, or whether it is inseparable.