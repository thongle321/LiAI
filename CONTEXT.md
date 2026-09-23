# LiAI Ubiquitous Language

Glossary only. No implementation details.

## Models domain

- **Model** — A GGUF artifact the user downloads, imports, or picks from the
  catalog in the app, and that the backend can store and serve for chat
  (ADR-006). Spans client (file management) and backend (serving).
- **Provider** — A remote API connection (OpenRouter or custom OpenAI-compatible),
  user-owned and unbounded in number. Displayed generically; never special-cased
  by type.
- **Ready to use** — A derived list: completed local Models plus configured
  Providers. Computed, never stored.
- **Available to download** — The bundled preset catalog, filtered for display
  by device tier (ADR-003). Shipped with the app, not stored per user.
- **Model Settings** — Per-model overrides (display name, system prompt, stop
  words), keyed by model id, sent with each chat request.
- **Secret** — Key material (provider API keys, HF token). Lives in SecureStore
  only; never in KV payloads, logs, or the backend-bound chat body beyond use.
  App-owned keys live only in backend env (ADR-004).
- **BYOK** — A user-supplied credential stored in SecureStore and forwarded to
  the backend per request; used transiently, never persisted or logged there
  (ADR-004).

## Chat domain

- **Session** — A named conversation the backend owns (Supabase `sessions` /
  `messages`). The client keeps only the active session id and per-session
  drafts locally; never a client database (ADR-005).
- **Turn** — One user message plus the assistant reply and any tool steps, the
  unit the backend persists.
- **Streaming** — The reply arriving as SSE events (`token`, `tool`, `usage`,
  `done`) rendered incrementally; a request-scoped channel, not a persistent
  socket (ADR-005).

## Agent domain

- **Talent** — A backend-executed tool the agent may call (datetime, calculate,
  web_search, read_url). Never a client function (ADR-007).
- **Agent run** — One backend loop: stream the reply, dispatch talents, feed
  results back, force a final answer at the turn budget (ADR-007).
