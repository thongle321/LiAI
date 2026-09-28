# ADR-005: Chat architecture — backend-owned sessions, SSE streaming, custom UI

Date: 2026-09-24
Status: Accepted

## Context

PocketPal's chat is its core surface: multi-session management persisted in
WatermelonDB, streaming completions, markdown→HTML rendering with syntax
highlighting, tool-call surfaces, and message actions. LiAI's chat is a single
session, non-streaming, plain-text, with the backend owning history
(Supabase `sessions`/`messages`). Porting parity requires choosing the session
store, the streaming transport, the UI stack, and the markdown renderer.

> Superseded in part by ADR-0012: sessions are local (TinyBase + SQLite), not
> backend-owned. The rest of this record stands.

## Decision

- **Sessions are backend-owned.** Supabase `sessions`/`messages` is the only
  store; the client keeps the active session id and per-session drafts in
  AsyncStorage. No client database (extends ADR-001 to the chat domain).
- **Streaming is SSE over XHR.** React Native `fetch` cannot stream response
  bodies, so the client uses an XHR-based SSE parser (PocketPal's approach; no
  new dependency). `POST /api/chat` gains a `stream` flag: default `false`
  returns the existing JSON contract, so the voice and vision paths are
  untouched.
- **The chat UI stays custom.** `Bubble`/`InteractionPanel` (Uniwind, tokened,
  dictation-integrated) are kept and extended with streaming display and date
  grouping. The evaluated `@kesha-antonov/react-native-chat` fork is rejected:
  it drags in the `react-native-keyboard-controller` native module (dev-client
  rebuild), a parallel `IMessage` model, and renderer overrides to meet the
  design system — more cost than the plumbing it replaces.
- **Markdown uses `react-native-marked`** (approved this session): it bundles
  `marked`, renders tokens to native views directly, themes to our tokens, and
  its `RendererInterface` override plugs `react-native-code-highlighter` (the
  same-author bridge PocketPal's code renderer uses, pulling in
  `react-syntax-highlighter` + types) into code blocks. One dependency instead of PocketPal's markdown→HTML→native chain —
  `marked` and an HTML renderer are not installed separately.
- **Link previews use `link-preview-js/mobile`** — the package's export map
  ships a Node-free variant for RN runtimes. Previews fetch uncredentialed
  public pages only (the one ADR-004 exception).
- In-chat messages may carry **one image** (camera or gallery) via the existing
  backend image path, alongside the standalone real-time vision screen.

## Consequences

- Three new frontend dependencies (`react-native-marked`,
  `react-syntax-highlighter` + types, `link-preview-js`), all pure JS.
- The backend gains session CRUD, paged history, and an SSE framing module.
- Feature parity items (copy/regenerate, suggested prompts, usage stats,
  export, search-in-chat) build on this base; usage is persisted from wave 1
  even where its UI lands later.
- If `react-native-keyboard-controller`-class problems ever force a chat-UI
  swap, this decision is the one to revisit.
