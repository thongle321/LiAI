# PocketPal chat divergence — what LiAI has, and where it doesn't

**Date:** 2026-10-06
**Reference:** `pocketpal-ai/` at `v1.19.1` (HEAD `937c9bc0`), read-only checkout.
**Companions:** `2026-09-29-pocketpal-chat-feature-audit.md` (G-series,
PocketPal→LiAI, chat screen) and `2026-10-06-pocketpal-changelog-gap-audit.md`
(C-series, app-wide).

> **Why this document exists.** Both prior audits are one-directional: they
> inventory PocketPal and record where LiAI falls short. Nothing recorded the
> reverse. This closes that gap — for features LiAI **has**, what PocketPal
> does with the same feature, and where LiAI is ahead or behind.
>
> **Method.** Both chat screens were inventoried independently from current
> source (ten areas each), then compared. Presence was already audited, so the
> interesting output is *divergence*, not presence. Every absence claim below
> was verified by search against the working tree, not inferred from the
> changelog wording.

---

## 1. Where LiAI is ahead

Features PocketPal lacks, or has shipped and then switched off.

| # | Feature | LiAI | PocketPal |
| --- | --- | --- | --- |
| A1 | **Date dividers** | Active — `lib/chat/rows.ts:70-101`, `components/chat/DateHeader.tsx:6-14` | **Built but disabled.** `showDateHeaders` defaults `false` (`ChatView.tsx:220`); ChatScreen never passes it |
| A2 | **Per-message timestamps** | `MessageListItem.tsx:160-170` — `formatTime` + spinner / `CheckCheck` | *"There is no per-message timestamp anywhere in the chat UI"* |
| A3 | **In-conversation search** | `chat.tsx:386-409` — animated bar, `"N of M"` match label | Absent. `EnhancedSearchBar` exists but is used only by HF model search |
| A4 | **Assistant name + avatar** | `MessageListItem.tsx:176-250` | Dead UI — `showUserAvatars` never passed (`Message.tsx:422`) |
| A5 | **Persisted per-session drafts** | `store/chat/draft.ts`, `lib/chat/session-store.ts:66` | Memory-only `Map` (`ChatSessionStore.ts:1419`), explicitly *"Not persisted across app restarts"* |
| A6 | **Three-level route error boundaries** | `components/RouteErrorBoundaries.tsx` — Root / Drawer / Tabs | No equivalent |
| A7 | **Streaming blank-space reservation** | `chat.tsx:256-291` — animates to list height while a reply streams | Absent |
| A8 | **Export injection-hardening** | `lib/chat/export.ts:38-50` — titles whitespace-collapsed so they cannot forge a heading; filenames strip `/ \ : * ? " < > \|` | Sanitises the filename only |
| A9 | **Screen-wake epoch ticket** | `lib/chat/keep-awake.ts:33-91` — undoes a lock taken after a release | Activate on send, deactivate in `finally` |
| A10 | **Import: minted `toolRuns` ids** | `lib/chat/import.ts:76-88` — `toolRuns` is a global table, so file-supplied ids would let one backup overwrite another conversation's calls | Regenerates ids, but has no global tool table to collide on |
| A11 | **Import: partial-write rollback** | `store/chat/sessions.ts:256-280` — a session whose appends fail is deleted and counted, never left looking intact | Not present |
| A12 | **Import: honest skip reporting** | `droppedRich` and dropped steps are counted, not discarded with `skipped: 0` | Not present |
| A13 | **Tap-to-retry error card** | `MessageListItem.tsx:104-121` + `clearOnFirst` on re-answer (`store/chat/send.ts:329-373`) | Long-press → Regenerate only |
| A14 | **Ref-counted offload suspension** | `lib/inference/offload.ts:31-52` — a counter, not a boolean, with an idempotent resume handle | Named suppression reasons (equivalent intent, different shape) |
| A15 | **Composer inert while sending** | `editable={!sending}` (`MessageInput.tsx:455`) | Not present |
| A16 | **Model label disambiguation** | `chat.tsx:137-146` — remote renders `name (host)` | Cloud icon |
| A17 | **Tab bar hides while keyboard is up** | `chat.tsx:243-246` + `tabBarCompensation` keeps centring identical | Not present |

**A1–A4 are the substantive ones.** PocketPal implemented date headers and
avatars and then disabled both; LiAI built and kept them. This is the clearest
evidence that "parity" is not a single direction.

---

## 2. Where PocketPal is ahead

Verified absent in the LiAI working tree.

| # | Gap | LiAI | PocketPal |
| --- | --- | --- | --- |
| B1 | **Session list date grouping** — Today / Yesterday / This week / … plus a hoisted Pinned group | `SessionList.tsx` has pin handling, **no grouping at all** | `SidebarContent.tsx:315`, pinned group at `ChatSessionStore.ts:1194` |
| B2 | **Multi-select mode** — select-all, bulk delete, bulk export | Confirmed absent | `SidebarContent.tsx:186,427,458` |
| B3 | **Markdown tables** | `ChatRenderer` overrides only `code()` (`MarkdownView.tsx:20`) | `TableRenderers.tsx`, wired into both content and reasoning providers |
| B4 | **`render_html` talent + sandboxed HTML preview** | Confirmed absent — 4 talents only | `RenderHtmlTalentUI.tsx` → `HtmlPreviewBubble.tsx:131`, strict CSP at `:46` |
| B5 | **Per-tool metrics footer** (`1,500 tokens · 35s`) | Confirmed absent | `ToolMetricsFooter.tsx:28` |
| B6 | **Macrotask yield every 100ms while streaming** | Confirmed absent | `useChatSession.ts:722` — without it, Stop cannot dispatch during a long stream |
| B7 | **Lazy message hydration** — list loads metadata only | Confirmed absent; every switch reads all turns | `ChatSessionStore.ts:271,406`, guarded by `messagesLoaded` |

**Recorded as `C11`–`C17` in the C-series audit**, so there is one ordered
backlog rather than two competing lists.

### Also divergent, lower priority

| # | Item | Note |
| --- | --- | --- |
| B8 | Streaming write throttle + flush before structural step changes | PocketPal `ChatSessionStore.ts:654,692`, with a documented regression sequence it prevents. **Not verified in LiAI — do not treat as a gap without checking** |
| B9 | Pending indicator with per-talent labels, token count, elapsed time | **Not verified in LiAI** |
| B10 | Graded effort cycle on the thinking pill | LiAI's is a deliberate on/off toggle (`MessageInput.tsx:471-501`) |
| B11 | Images persist with the message | LiAI's are render-only (`types/chat.ts:71-73`) — see defect D3 below |

---

## 3. Deliberate divergences — *not* gaps

| Item | LiAI | Why it is a choice |
| --- | --- | --- |
| Thinking pill is a toggle | `MessageInput.tsx:471-501` | Effort cycling deliberately omitted; `Brain` + "Think", state carried by fill *and* glyph |
| Remote engines receive no samplers | `store/chat/index.ts:230` | Sending typical-p / XTC / mirostat to an OpenAI-compatible endpoint is sending knobs it ignores |
| `providerType` never changes the wire | `remote-engine.ts:104-109` | Recorded as **B1** in the C-audit; documented consequence |
| Remote `contextFull` always false | `remote-engine.ts:133-143` | A false "context full" banner is worse than none |
| Session mode hidden for unsent conversations | `GenerationSettingsSheet.tsx:104-107` | No row to override yet |
| Import not gated on `hasSession` | `components/chat/ChatMenu.tsx` | Restoring into an empty app is the main case |
| Actions in the scroll body, not a native footer | `GenerationSettingsSheet.tsx` | The native footer lifts over scrolled content |
| `modalAvailable()` returns constant `false` | `store/chat/send.ts:22-32` | Deliberate single flip point until projector pairing exists |

---

## 4. Defects found on the LiAI side

Not parity gaps — things that will bite. First two are now fixed.

**D1 — `lib/chat/transcript.ts` was dead code. — FIXED**
`buildTranscript` had no production caller; only `tests/chat-search-export.test.ts`
imported it, so a green suite was keeping it alive. Markdown export actually
goes through `lib/chat/export.ts`. Deleted, along with its test block. The
in-chat search coverage sharing that file was kept.

**D2 — `ChatWarningSnackbar`'s retry path is unreachable. — left as-is**
`chat.tsx:548` renders it with no `onRetry`, and the only warning ever raised
is `recoverable: false` (`store/chat/send.ts:125`). The severity / `recoverable`
machinery in `store/chat/types.ts:79-89` therefore has **no producer that uses
it**. Deliberately retained: it is a seam the next recoverable warning needs.

**D3 — Images silently vanish on reload.**
`types/chat.ts:71-73` makes `images` render-only; `StoredTurn` has no image
field. Attach → render → send all work, then a reload loses the photos.
`lib/chat/import.ts:150` documents the matching decision not to invent the
field on restore. PocketPal keeps `imageUris` on the message
(`TextMessage.tsx:182`) and drops them only on Markdown export.

---

## 5. Method notes

1. **Both sides were inventoried from source, not from the changelog.** The
   G-audit predates this work and records no PocketPal baseline commit, so
   nothing could be inherited from it.
2. **Absence claims were verified by search, not inferred.** Several early
   greps returned false positives — `toolSurfaces.tsx:39` matched a loose
   "table" pattern, `MessageInput.tsx:38` matched "throttle" inside a comment.
   Every absence in §2 was re-checked with a precise pattern.
3. **Only one commit has touched PocketPal's chat screen since the G-audit** —
   `#895`, in the API layer, already logged as B1 in the C-audit. A forward
   refresh would have been empty, which is why this went the other way.

## 6. Open questions

1. `lib/chat/transcript.ts` was deleted rather than wired up. If a
   *copy-to-clipboard* Markdown export is ever wanted, that is a new feature —
   the file's own docstring said "for the clipboard (user-approved)", which
   suggests it was built for something that was never finished.
2. D3 (images not persisted) is a deliberate boundary, but it is also the
   single most likely thing a user reports as "the app lost my photo".
3. B8 and B9 are unverified in both directions — check before treating either
   as a gap.
