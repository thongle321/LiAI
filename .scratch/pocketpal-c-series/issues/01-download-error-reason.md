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

~~PocketPal has no direct equivalent~~ — **that claim was false** (corrected by the
C-series parity fact-check, 2026-10-06): PocketPal does surface the stored reason,
in a dialog rather than on the button — `pocketpal-ai/src/screens/ModelsScreen/ModelsScreen.tsx:415-431`
(`<DownloadErrorDialog error=…>`), dialog logic `pocketpal-ai/src/components/DownloadErrorDialog/DownloadErrorDialog.tsx:19-51`
(props through the `error?.code === 'storage'` branch at :51),
reason written at `services/downloads/DownloadManager.ts:278-282`; the retry button
itself carries no reason (`ModelsScreen.tsx:392`). Found by the divergence sweep,
not the changelog. `spec.error` verified as the field.

## Decision (recorded)

**Inline-on-the-button instead of PocketPal's modal dialog — kept deliberately.**
The acceptance criteria (readable, no layout push, a11y label carries the reason)
were all met by the inline surface, and a modal for a one-line reason is heavier
than the failure deserves. The original choice was made against the false "no
equivalent" baseline above; on review it stands — recorded so later audits don't
inherit the premise (parity fact-check, issue 01 = PREMISE WRONG).
