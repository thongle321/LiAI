# ADR-001: Versioned AsyncStorage KV, no local database

Date: 2026-09-21
Status: Accepted

## Context

PocketPal persists its model catalog in AsyncStorage KV plus WatermelonDB +
SQLite for chat/pals, with versioned migrations throughout. We are adapting
its model/persistence data (minus pal features) to fit LiAI's functionality.

Options considered:

1. Adopt WatermelonDB + SQLite (two new native deps, real tables, migrations).
2. Keep AsyncStorage-only with versioned keys and parse/merge upgrade guards.

## Decision

Option 2. Our persisted data is tiny (a model list, providers, settings,
tokens) with no relational queries; a native DB adds config, binary size, and
a new dependency class without a corresponding need. Upgrades run through
`MODEL_STORE_VERSION` with idempotent prune-and-reconcile functions
(`lib/model-upgrade.ts`), following the proven `lib/model-settings.ts` pattern.

Key material is the exception: provider API keys and the HF token move to
`expo-secure-store` (first-party Expo, no native config, Expo Go compatible),
mirroring PocketPal's Keychain usage. Metadata stays in KV, scrubbed of keys;
wipe-on-delete mirrors their ServerStore behavior.

## Consequences

- No new third-party dependencies; one first-party Expo module.
- Malformed or legacy records prune to safe defaults on load instead of
  crashing or silently carrying stale shapes.
- If relational needs (chat history search, sync) appear later, revisit with a
  new ADR — this decision covers the models domain only.
