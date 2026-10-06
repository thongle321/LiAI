# Make markdown links open

**Gap:** C2
**Status:** ready-for-agent
**Blocked by:** none

`ChatRenderer` (`components/chat/MarkdownView.tsx:20`) overrides only `code()`, so `Linking` is never invoked and a rendered URL does nothing. The only link-opening surfaces in the app are web-search hits (`toolSurfaces.tsx:155`) and `LinkPreview.tsx:41`.

## Acceptance

- Tapping a rendered link opens it via `Linking`.
- Only `http`/`https` are openable — no `file:`, `javascript:`, or bare scheme. Mirror the guard PocketPal uses in `WebSearchResultsSheet.tsx:24` (`const isOpenableUrl = (url) => /^https?:\/\//i.test(url)`; the earlier `:38` citation in this issue was stale — corrected by the parity fact-check).
- An unopenable scheme renders as plain text rather than an inert-looking link.
- Failure to open shows an inline message rather than silence.
- Long-press / selection still works on link text.
- Accessibility: links announce as links, with the href as a hint.

## Files

`components/chat/MarkdownView.tsx` primarily.

## Notes

Shares `MarkdownView.tsx` with 09. Do them in either order, but do not run them concurrently in one context.
