# LiAI Ubiquitous Language

Glossary only. No implementation details.

## Models domain

- **Model** — A downloadable or downloaded GGUF (or imported local file) the app
  can list, download, activate, and delete. Never a backend entity.
- **Provider** — A remote API connection (OpenRouter or custom OpenAI-compatible),
  user-owned and unbounded in number. Displayed generically; never special-cased
  by type.
- **Ready to use** — A derived list: completed local Models plus configured
  Providers. Computed, never stored.
- **Available to download** — The bundled preset catalog. Shipped with the app,
  not stored per user.
- **Model Settings** — Per-model overrides (display name, system prompt, stop
  words), keyed by model id.
- **Secret** — Key material (provider API keys, HF token). Lives in SecureStore
  only; never in KV payloads, logs, or the backend-bound chat body beyond use.
