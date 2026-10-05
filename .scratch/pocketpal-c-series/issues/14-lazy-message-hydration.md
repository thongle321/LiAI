# Load session metadata lazily, hydrate messages on open

**Gap:** C17
**Status:** ready-for-agent
**Blocked by:** none

Every session switch reads all turns. PocketPal loads metadata only and hydrates on first open (`ChatSessionStore.ts:271,406`), guarded by a `messagesLoaded` flag.

## Acceptance

- Listing sessions does not read turn bodies.
- Opening a session hydrates its turns once; re-opening does not re-read.
- The active-session pointer still reconciles against a deleted session.
- Switch, delete, duplicate and edit all behave identically to today — the guard must never leave a session showing an empty transcript.
- Mid-turn switch refusal is preserved.

## Files

`lib/chat/tinybase-store.ts`, `lib/chat/session-store.ts`, `store/chat/sessions.ts`.

(`store/chat/sessions.ts` ended up untouched — its pointer-reconcile and mid-turn
behaviour already existed; noted by the parity fact-check.)

## Notes

**The most likely source of data-loss regressions in the set** — a stale or missing guard shows an empty conversation that looks like lost data. Guard with existing session-store tests plus new lazy/hydrate cases, and verify on device with a long conversation. If a store write fails mid-hydrate the conversation must still resolve.
