# ADR-004: Two-tier secret ownership; the backend makes provider calls

Date: 2026-09-24
Status: Accepted

## Context

PocketPal keeps server API keys, the HuggingFace token, and search-provider keys
in the device Keychain and calls those providers from the app. LiAI's root
`AGENTS.md` says never expose secrets to the client and route external AI/API
access through the server, while the models domain already stores user-provided
keys in `expo-secure-store` (`CONTEXT.md` "Secret", ADR-001). Porting remote
providers and web search needs one rule that satisfies both.

## Decision

Two tiers:

1. **App-owned keys** — the default OpenRouter model and any provider the app
   itself pays for — live only in backend env/config. The app never sees them.
2. **User BYOK keys** — a user's own OpenRouter / search / HuggingFace
   credential — are entered in the app, stored in `expo-secure-store`, and
   forwarded to the backend per request over TLS. The backend does not persist
   them.

In both tiers the **backend performs the call**. The app never calls a model or
search provider directly.

**One narrow exception:** uncredentialed public-content fetches (link previews
for URLs the user's own message contains) are made from the app via
`link-preview-js/mobile`. The rule protects secrets and AI execution, not
public pages; anything carrying a credential or invoking a model stays
backend-only.

## Consequences

- Provider keys stay where the user already expects them (SecureStore) without
  shipping app secrets in the bundle.
- A BYOK request carries a credential per call; the backend treats it as
  transient and must not log it.
- PocketPal's direct-from-app provider clients are not ported; their behaviour
  becomes backend modules (search, completion providers).
- HuggingFace catalog calls follow the same rule: proxied through the backend,
  not called from the app.
- The link-preview exception carries no credential; if previews ever need
  authenticated sources, they move behind a backend route.
