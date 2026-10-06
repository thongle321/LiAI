# Vision toggle & projection-model selection

Date: 2026-10-06. Status: implemented. Supersedes the "LiAI cannot pair one
(ADR-0011)" exclusion that hid projector files in HF search and left the
models card without vision controls.

> Note on the citation: `ADR-0011` in `PRODUCT.md` is the **engine**
> decision (QVAC → llama.rn), not a projector-pairing decision. The old
> code comments cited it for a rule it never stated. This document is the
> decision record for pairing; the citation is gone.

## Why

The pairing machinery already existed — `findProjectorFile()` pairs a
repo's sibling mmproj, `pairDownloadStep()` sequences the two download
legs, `projectorPathForFileName()` resolves the pair at load — but the
**decision surface** did not. A vision model downloaded blind; a failed
projector leg was only visible as a download error; and nothing could
turn vision off for a model that did not need it. PocketPal has all three.

## Decisions

| # | Decision | Choice |
| --- | --- | --- |
| Q1 | What the vision toggle does | Real switch: ON attaches the paired projector, OFF loads blind. Persisted per model |
| Q2 | Selector scope | The repo's sibling mmproj files, recorded on the spec at build time (`projectorCandidates`) — no Hub round-trip, no standalone projector search |
| Q3 | Missing-projection warning | Fires when vision is on, a projector is recorded, and it is not on disk; offers "Download projection model", which runs the projector leg only |
| Q4 | Where the switch lives | `ModelSpec.visionEnabled` — a property of the catalog row, beside `projector` |
| Q5 | Vision tab copy | Up-front notice with an "Open Models" shortcut when the active model has vision off |
| Q6 | Changing vision/projector on the active model | Confirm dialog, then release the engine; the next turn reloads through the same `ensure()` that resolves the pair |
| Q7 | Detach | Confirm dialog naming dependent models; vision goes off for them |
| Q8 | How a card knows a model is vision-capable | `ModelSpec.supportsVision`, recorded from HF tags + sibling mmprojs, with an upgrade path for rows saved before it |
| Q9 | Download-time vision choice | PocketPal parity: a VisionDownloadSheet in HF search — "Download with vision" / "Download text only" + which projector. The plain Download button takes the default (with vision) |

## Data model

```ts
ModelSpec {
  supportsVision?: boolean;      // HF tags/siblings said so
  visionEnabled?: boolean;       // absent = on (pocketpal parity)
  projector?: ModelFile;         // existing: the paired projector
  projectorCandidates?: ModelFile[];  // sibling mmprojs, recorded once
}
```

Deliberately **not** pocketpal's shape. PocketPal makes projectors
first-class `Model` rows referenced by id string; LiAI keeps the projector
inline on the model and downloads it as a second leg of the same job. That
keeps one downloader, one progress bar, and one integrity story instead of
a second model lifecycle to maintain.

## Shape of the truth

Three pure functions in `lib/models/vision-pairing.ts` answer every
question the UI asks, so the card, the sheet and the gate cannot disagree:

- `mmprojSiblings(files)` — what counts as a projector (one filter, shared
  with the pairer and the selector)
- `projectorStatus({hasProjector, projectorBytes})` — `not_needed` /
  `downloaded` / `missing`
- `visionActive({visionEnabled, status})` — the single "can it see?" rule

The vision gate itself (`specCanSeeImages` in `lib/inference/mmproj.ts`)
reads the same `visionEnabled`, so turning vision off blinds the load
path, the send gate and the composer together.

## Files

| Change | Where |
| --- | --- |
| Spec fields | `types/models.ts` |
| Hydration + inference for old rows | `lib/model-upgrade.ts` |
| Recording the vision facts | `lib/models/huggingface.ts` (`buildHfModelSpec`), `lib/models/vision-pairing.ts` |
| Pure rules | `lib/models/vision-pairing.ts` |
| Store actions | `store/models/{catalog,downloads,types}.ts` — `setVisionEnabled`, `setProjector`, `detachProjector`, `startProjectorDownload`, `startDownload(…, options)` |
| Card UI | `components/models/ModelCardDetails.tsx`, `ProjectorSelectorSheet.tsx` |
| Download-time sheet | `components/models/VisionDownloadSheet.tsx`, `HFModelSearch.tsx` |
| Vision tab copy | `app/(drawer)/(tabs)/vision.tsx`, `components/VisionOverlays.tsx` |
| Gate | `lib/inference/mmproj.ts` |
| Checks | `tests/vision-pairing.test.ts` |

## Open items

1. **No node coverage of the reload path.** Releasing the engine on a
   vision/projector change is verified by reading, not by test: the engine
   slot is native. Manual check: with a model active, switch vision off and
   confirm the next turn loads blind and the notice clears.
2. **Candidates are frozen at build time.** A repo that adds an mmproj
   later will not offer it until the model is re-bookmarked from search.
   Acceptable: re-searching is the natural refresh.
3. **`supportsVision` for old rows is inferred** from a recorded projector
   or the filename-derived `type`, so a pre-existing vision model with no
   pair shows no toggle until it is searched again.