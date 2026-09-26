# ADR-0010: Chat persistence in Supabase; AsyncStorage keeps UI state

Date: 2026-09-24
Status: Accepted
Amends: ADR-005 (sessions backend-owned), ADR-001 (KV store scope)

## Context

Sessions/messages live in the backend's Supabase store with the client
keeping only the active session id and drafts (ADR-005); other prefs live in
versioned AsyncStorage KV (ADR-001). Retiring the backend (ADR-0008) removes
the session owner, so the app must own persistence directly: Supabase via the
Expo Supabase guide for chat history, AsyncStorage as today for everything else.

## Decision

- **Supabase is the sessions/messages store, accessed from the app** with
  the `sessions`/`messages` shape (title, pinned, turn metadata incl. tool
  provenance and usage). The 100-turn cap per session stays.
- **Identity is silent anonymous provision:** Supabase Auth anonymous
  sign-in at first run, persisted on-device, upgradeable to email later —
  no login screen. RLS is per-user (`auth.uid()`), which gives multi-device
  history once the user upgrades; a single device works with zero UX.
- **AsyncStorage keeps exactly what it has now:** active session id,
  per-session composer drafts, voice/search/UI prefs, model settings —
  versioned keys, no new client database (WatermelonDB explicitly not adopted;
  ADR-001's no-local-DB rule extends to chat).
- **Offline is degraded-honest, not queued:** without network, Supabase reads
  fail and the chat surfaces the error; local inference still answers, but
  turns made offline are not backfilled. A local write queue with later sync
  is deferred until offline chat is requested.

## Consequences

- Supabase anon + URL config becomes app config (public anon key in Expo
  config; RLS, not secrecy, is the protection).
- Drawer session list, rename/pin/delete, and history load become Supabase
  queries behind the existing store seams; the UI keeps its current shape.
- Multi-device sync arrives free with email upgrade; anonymous users are
  single-device by keychain, which matches the silent-provision promise.
