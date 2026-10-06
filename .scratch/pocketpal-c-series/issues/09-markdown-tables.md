# Render markdown tables

**Gap:** C13
**Status:** ready-for-agent
**Blocked by:** none

`ChatRenderer` overrides only `code()`, so there is no table handling at all. Any model output containing a table renders poorly. PocketPal ships `TableRenderers.tsx` wired into both the content and reasoning providers.

## Acceptance

- GFM tables render with visible cell structure (header row distinguishable, borders or fills).
- Wide tables scroll horizontally instead of clipping or wrapping cells into unreadable rows.
- Tables inside the reasoning block render too, or are explicitly and visibly unsupported — decide, do not leave half-working.
- Streaming does not re-mount the table per token (the module-level renderer identity at `MarkdownView.tsx:29` must be preserved).

## Files

`components/chat/MarkdownView.tsx`.

## Notes

**Verify before designing:** whether `react-native-marked`'s `Renderer` exposes a table hook at all. If it does not, this needs a different mechanism and the ticket should say so rather than forcing the obvious shape. This is the gap most likely to be seen by a user.
