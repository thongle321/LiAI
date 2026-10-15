Status: ready-for-agent
Type: task
Blocked by: 08

# Ticket 09 — Port the remaining chat and session behavior guards

The Node `--test` suite that was retired under ticket 08 carried chat
behavior tests that were never ported to `store/__tests__/chat-store.test.ts`.
Deleting `tests/legacy/` (ticket 08) removed them, so these are follow-ups by
design — the spec's rule is that unported guards become tickets rather than
silently vanishing.

Retired guards in this area:

- `chat-drafts` — per-session composer draft lifecycle (persist on switch,
  clear on send, parked draft for a fresh conversation, deleted session's
  draft does not come back). Drives `store/chat/draft.ts` through the store
  with `tests/fakes.ts`; the ports are mechanical.
- `chat-export` / `chat-search-export` — export rendering and search-filtered
  export (`lib/chat/export.ts`, `lib/chat/export-read.ts`).
- `chat-import` — import validation, rejection and id renewal beyond the two
  cases already in `store/__tests__/chat-store.test.ts`.
- `chat-keep-awake` — wake lock held for the life of a turn and released on
  every exit path, through the injected `keepAwake` seam.
- `session-bulk` / `session-groups` — `deleteSessions` counting and the
  drawer's pinned/bucketed sectioning (`lib/chat/session-groups.ts`).
- `attachments` — image picking, `MAX_IMAGES` clamp, data-uri conversion
  (`lib/chat/attachments.ts`).
- `blocks` / `chat-rows` — ordered reasoning/text/tool blocks and the row
  model the message list renders (`lib/chat/blocks.ts`, `lib/chat/rows.ts`).
- `chat-tool-results`, `chat-image-and-link`, `chat-models`,
  `chat-header-menu`, `chat-menu` — mixed store and pure-rule coverage.

## Acceptance

- [ ] Draft lifecycle, export, import, bulk session ops, attachments and the
      row/block model all have behavior tests under their module's
      `__tests__/`.
- [ ] Tests drive injected seams; no native module, no `readFileSync`.
- [ ] Anything still unportable is recorded here as a note rather than
      dropped silently.

## Context pointers

- Spec: `.scratch/jest-test-migration/spec.md`
- Existing ports: `store/__tests__/chat-store.test.ts`,
  `lib/chat/__tests__/local-turn.test.ts`, `tests/fakes.ts`
- Git history: the retired files are in `git show HEAD~1:tests/legacy/`
