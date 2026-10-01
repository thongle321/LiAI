# ADR-0012: Chat persistence is local — TinyBase + SQLite; no backend, no identity

Date: 2026-09-28
Status: Accepted
Supersedes: ADR-0010 (Supabase chat store), ADR-001 (no local DB)

## Context

ADR-0010 put sessions and messages in Supabase with anonymous sign-in and
per-user RLS, keeping only the active session id and drafts in AsyncStorage.
In practice that bought nothing that was used:

- **No backup was wanted.** History lived on one vendor's project, and
  nobody was relying on it to restore anything. The remote copy was a
  liability (a credential in app config, a data-egress promise in the
  product copy) without a corresponding benefit.
- **The store was a network round-trip in the hot path.** Every send
  appended two rows and read a session back, so the chat's durability was
  coupled to a request that could fail on a train.
- **The data model was fighting the storage.** Tool calls and usage lived
  in a JSON `metadata` blob because Postgres made a child table awkward,
  and the read path had to re-parse it defensively on every load.

ADR-0008 already retired the backend, so the app owning persistence
directly is the settled direction; this ADR picks the local shape.

## Decision

- **A TinyBase `Store` is the chat database, persisted to SQLite** via
  `persister-expo-sqlite`. A plain Store, not a MergeableStore: nothing
  synchronizes, so CRDT metadata would be cost without benefit.
- **Tables, not a blob.** `sessions` (title, pinned, updatedAt, seq),
  `messages` (sessionId, role, content, type, at, seq, usage cells),
  `toolRuns` (messageId, position, tool, input, result) and `drafts`
  (text). Tool calls are queryable rows in call order, and usage is typed
  cells, so the defensive metadata parsing is deleted.
- **`position` is the call-order key** on `toolRuns`, and `seq` is the
  ordering key on `messages` and `sessions`. TinyBase tables are unordered
  maps, and two appends can land in the same millisecond, so a timestamp
  cannot order anything reliably.
- **No identity.** No sign-in, no user id on any row, no RLS. One device,
  one dataset. A device id is added the day multi-device is actually
  wanted, not before.
- **One persistence mechanism for chat.** The active-session pointer and
  per-session drafts move out of AsyncStorage into the same Store, so
  there is no second home for session-scoped state.
- **Unbounded messages.** The 100-turn cap existed to stop a remote table
  bloating; locally it would only ever delete someone's history. Device
  storage is the ceiling.
- **Live state stays out of the Store.** `streaming` and `error` are
  render state, never persisted, so a restart cannot resurrect a bubble
  stuck mid-stream.
- **Zustand stays the app's read surface.** Components keep using
  `useChatStore`; the Store sits behind a `SessionStore` port
  (`lib/chat/session-store.ts`). The blast radius of a storage change is
  one implementation, not every screen.

## Consequences

- **Chat history now exists on exactly one device.** This is a permanent
  product change, not a bug: losing the phone loses the conversations.
- **expo-sqlite is a native module**, so this needs a dev-client rebuild —
  the same class of cost VisionCamera already carries.
- **The data layer is testable in `node`.** The Store operations take a
  Store and import nothing native, so `tests/tinybase-store.test.ts`
  exercises the real implementation in-memory. Only the persister wiring
  (`lib/tinybase.ts`) is device-verified.
- **Load happens before save.** `startAutoPersisting()` is used precisely
  so the first save cannot overwrite the database with an empty Store.
- Other preferences (inference params, model settings, search) stay in
  AsyncStorage; only chat moved.
