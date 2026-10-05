# Multi-select with bulk delete and export

**Gap:** C12
**Status:** ready-for-agent
**Blocked by:** 10-session-date-grouping.md

Confirmed absent. PocketPal: selection mode with a checkbox header, select-all, count-confirmed bulk delete, and bulk export of the selected sessions (`SidebarContent.tsx:186,427,458`).

## Acceptance

- An explicit selection mode, not a long-press-only gesture.
- Per-row checkbox plus select-all.
- Bulk delete asks for confirmation with an explicit **count** — never a generic "are you sure".
- Bulk export writes one JSON of exactly the selected sessions, reusing `lib/chat/export.ts`'s existing `toAllSessionsJson` rather than a second serializer.
- Exit selection mode leaves pin/rename/delete untouched.
- Selection is cleared on session switch, delete, and drawer close — never leaking across contexts.
- Mid-turn guard is preserved: a session with an in-flight turn is not deletable, same as the single-row path.

## Files

`components/chat/SessionList.tsx`, `store/chat/sessions.ts`, `components/chat/ChatMenu.tsx`.

## Notes

Build on 10's grouped shape — doing this on a flat list means rework when grouping lands. Reuse the export path rather than inventing a parallel one; that is exactly the mistake that produced `lib/chat/transcript.ts`, dead code kept alive by a test.
