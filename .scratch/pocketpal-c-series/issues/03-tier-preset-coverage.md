# Stop a preset vanishing from the Models screen

**Gap:** C9
**Status:** ready-for-agent
**Blocked by:** none

`components/models/AvailableModels.tsx:252` renders **only** `tier.presetIds`. All 18 presets in `lib/models/huggingface.ts` are covered today, but a catalog entry without a tier row disappears with no error and no test failure.

No per-model `min_app_version` gate exists either — that half is PocketPal's device-rules v2 and is lower value here.

## Acceptance

- A preset in the catalog but missing from every tier is **detectable**, not silently invisible.
- Decide and record whether it (a) falls back to the lightest tier, (b) is appended to an "Other" group, or (c) fails the test suite. Pick one; do not leave it ambient.
- Tier matching itself is unchanged — `device-tiers.ts:16-53` is correct and out of scope, including its MiB-not-decimal-MB note.

## Files

`components/models/AvailableModels.tsx`, `assets/device-tiers.json`, `lib/models/device-tiers.ts`.

## Notes

A test comparing the catalog against the tier JSON is the real regression guard here.
