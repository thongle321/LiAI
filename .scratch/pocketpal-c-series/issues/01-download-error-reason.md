# Surface the download failure reason

**Gap:** C1
**Status:** ready-for-agent
**Blocked by:** none

`store/models/downloads.ts` writes error strings such as *"Not enough storage space to download the model"*. `DownloadButton` (`ModelBits.tsx:152`) renders only the word "Retry". Nothing in `components/models/` reads `spec.error` (`types/models.ts:48`).

The data is already collected and discarded — this is a rendering gap, not a data gap.

## Acceptance

- A failed download shows the stored reason, not just "Retry".
- The reason is readable (not truncated to nothing) and does not push the card layout around.
- Absent reason falls back to today's "Retry" wording — never an empty state.
- Exposes an accessibility label carrying the reason, since colour/label alone must convey failure.
- A source-scan guard pins that the error field is actually read.

## Files

`components/models/ModelBits.tsx` (primary), possibly `components/models/HFModelSearch.tsx`.

## Notes

PocketPal has no direct equivalent — this was found by the divergence sweep, not the changelog. Verify the exact field name before wiring; `spec.error` is the claim, not a verified read site.
