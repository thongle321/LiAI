# LiAI Ubiquitous Language

Glossary only. No implementation details.

## Models domain

- **Model** — A GGUF artifact the user downloads, imports, or picks from the
  catalog in the app, loaded on-device into the local inference context
  (ADR-0008, engine ADR-0011). Spans file management and serving, both
  client-side.
- **Inference engine** — The on-device runner behind a `CompletionEngine`
  interface: local GGUF via QVAC (streaming + stop), remote BYOK
  endpoint as fallback behind the same shape (ADR-0011).
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
- **BYOK** — A user-supplied credential stored in SecureStore and used
  transiently per request, never persisted or logged beyond use (ADR-004).
  With no backend, networked talents call providers directly from the app
  under a direct-BYOK exception (ADR-0009); there is no app-owned default
  model anymore.

## Chat domain

- **Session** — A named conversation owned in Supabase (`sessions` /
  `messages`), accessed from the app under per-user RLS. The client keeps
  only the active session id and per-session drafts locally; never a client
  database (ADR-0010, ADR-005).
- **Turn** — One user message plus the assistant reply and any tool steps, the
  unit the backend persists.
- **Streaming** — The reply arriving as SSE events (`token`, `tool`, `usage`,
  `done`) rendered incrementally; a request-scoped channel, not a persistent
  socket (ADR-005).

## Agent domain

- **Talent** — An on-device tool engine the agent may call (datetime,
  calculate, web_search, read_url), registered by name and generic across
  turns. Never a server function (ADR-0009).
- **Agent run** — One local loop: stream the reply, dispatch talents, feed
  results back, force a final answer at the turn budget (ADR-0009).
