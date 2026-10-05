# Group the session list by date

**Gap:** C11
**Status:** ready-for-agent
**Blocked by:** none


BLOCKS: 11-session-bulk-actions.

`SessionList.tsx` handles pinning but has no grouping at all. PocketPal groups into Today / Yesterday / This week / … with pinned sessions hoisted into a leading group (`SidebarContent.tsx:315`, `ChatSessionStore.ts:1194`).

## Acceptance

- Sections: Pinned (when any), Today, Yesterday, This week, Last week, 2–4 weeks, Last month, Older.
- Each group is newest-first.
- An empty session list keeps today's empty state.
- The current session is still visibly selected.
- Grouping is derived, not stored — no schema change.
- Section headers are accessible and the list remains non-janky on a long history.

## Files

`components/chat/SessionList.tsx`, `store/chat/sessions.ts`.

(`store/chat/sessions.ts` ended up untouched — grouping is derived in the
component; noted by the parity fact-check.)

## Notes

The list is currently a non-scrolling `FlatList`; grouping likely makes it a `SectionList`. Mind the per-row actions (pin/rename/delete) under a sticky header.
