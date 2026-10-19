# 2026-10-12 — HF model card: audit of the search → details → download flow

**Trigger.** Request to implement "the view model card hugging face" from
`pocketpal-ai/`, replicating its UI and feature set in this app's style.

**Scope (agreed).** The Hugging Face flow end to end, plus the surface it
lands on: `components/models/HFModelSearch.tsx` against
`pocketpal-ai/src/screens/ModelsScreen/HFModelSearch/{HFModelSearch,SearchView,DetailsView,DetailsView/ModelFileCard}`,
and the landing card `components/models/ModelCard.tsx` +
`ModelCardDetails.tsx`. The models *screen* chrome (FAB, group headers,
remote provider card) is out of scope — already ported and recorded in
`2026-10-10-model-card-architecture-parity.md`.

**Standing rules.** Same two as the 2026-10-10 record: `pocketpal-ai/` is
read-only reference, never edited; and parity is a licence to copy
structure, never a value — `DESIGN.md` wins every token.

**Method.** Source read on both sides, line by line. No screenshot was
used: the repo-root `pocketpal_card.jpg` that the 2026-10-10 record leaned
on is **not** a current reference and nothing here is derived from it.

## Verdict

The flow is **structurally complete**. Sheets, paging, per-file bookmarks,
the four warnings, storage gating, the vision pair decision, cancel/pause/
resume and the details header are all present and already documented as
parity. Seven gaps remain, all local to two render functions; none requires
new state, new deps, or a screen.

| # | Gap | Site | Reference |
|---|---|---|---|
| G1 | No empty state for "searched, found nothing" | `HFModelSearch.tsx:706` | `SearchView.tsx:118-124` |
| G2 | `onEndReached` has no duplicate-page guard | `HFModelSearch.tsx:710` | `SearchView.tsx:41-51` |
| G3 | GGUF file name has no line clamp | `HFModelSearch.tsx:462` | `ModelFileCard.tsx:281-288` |
| G4 | Every warning chip renders; none collapses | `HFModelSearch.tsx:537` | `ModelFileCard.tsx:295-306` |
| G5 | Downloaded file cannot be deleted from this sheet | `ModelBits.tsx:157-176` | `ModelFileCard.tsx:196-224, 349-372` |
| G6 | Vision chip is static text, no state or affordance | `HFModelSearch.tsx:481-494` | `ModelFileCard.tsx:308-330` |
| G7 | No MTP capability badge | `HFModelSearch.tsx:743-770` | `DetailsView.tsx:36-70, 76-88` |

## Gaps

**G1 — a search that finds nothing shows an empty sheet.** The results
`FlatList` has no `ListEmptyComponent`, and the loading branch
(`:697-704`) is the only alternative the sheet renders. The reference
distinguishes three empty states and this port implements two: error (yes,
`:717-733`, with the disable-token-and-retry action) and loading (yes).
"What the reference calls `noResults`" has no representation, so a typo or
an unsupported arch returns a blank panel under a populated search bar.
PocketPal's rule is the reason this matters: a blank list is
indistinguishable from a hung request.

**G2 — paging can double-fire.** `onEndReached={() => void loadMoreModels()}`
runs on every event at threshold `0.3`. The reference keeps
`lastOnReachedCall` and drops any call inside 1000ms
(`SearchView.tsx:41-51`), precisely because a fast fling emits several. Our
store has its own race handling (`tests/hf-search-race.test.ts`), so the
duplicate is absorbed rather than corrupting — which is why this is a
network-cost and jitter item, not a correctness one.

**G3 — long file names wrap and shove the row.** GGUF filenames carry the
repo prefix (`bartowski/Qwen_Qwen3-1.7B-Q4_K_M.gguf`) and are the longest
strings in this UI. `HFModelSearch.tsx:462` sets no `numberOfLines` and no
`ellipsizeMode`; the reference sets `numberOfLines={1}` +
`ellipsizeMode="middle"` (`ModelFileCard.tsx:281-288`). The name shares a
row with the bookmark button and the download button, so a wrap pushes both
actions down and the row stops reading as one line. This is the cheapest
fix in the set and the most visible.

**G4 — up to four warning chips, unbounded, with no detail view.** The four
codes exist and are correct (`lib/models/hf-warnings.ts:14-18`: storage,
memory, multimodal-without-projector, legacy-quantization — the reference's
four, `:99-124`). But `:537` renders every one that fires as its own chip,
so the worst case is a four-chip wrap under an already two-line row. The
reference collapses them into **one** chip carrying the first short message,
reads `N warnings` when there are more (`:299-304`), and opens a snackbar
listing the full messages numbered (`:376-398`). LiAI has that snackbar
already — `WarningSnackbar`, `:129-146` — but only fires it on *download*
(`:379`), never on tap. So the machinery is present and unwired.

**G5 — no delete path from the details sheet.** In the reference the file
row's download button *becomes* a delete button once the file is on disk
(`:196-224`), and tapping it confirms then calls `deleteModel` (`:349-372`).
Ours hands the row a shared `DownloadButton`, which returns an inert
"Downloaded" chip when `status === "completed"` (`ModelBits.tsx:157-176`) —
deliberately, per its own comment ("Completed is a state, not an action").
That is right for the models-screen card, where delete is a separate trash
button, but on this sheet there is no second control: a file downloaded from
here can only be deleted by leaving the sheet and finding it on the Models
screen. The two call sites want different things from one component.

**G6 — the vision chip does not say whether vision is on.** The reference's
chip carries an eye icon, a **state-dependent** label — "Vision enabled"
once downloaded, otherwise "Includes vision capability"
(`ModelFileCard.tsx:308-330`) — and a trailing chevron, because it opens
`VisionDownloadSheet` rather than doing anything itself. Ours renders the
static word "Vision" with no icon and no chevron (`:481-494`), so the row
cannot distinguish a model whose projector is already downloaded from one
whose projector is merely available. The sheet it opens is already
per-file and already correct (`:305-307`).

**G7 — MTP capability is never probed.** The reference probes the first LLM
file's GGUF on open (`probeRemoteMTPCapability`, `DetailsView.tsx:36-70`)
and shows a rocket chip beside the author when the model is capable
(`:76-88`), resetting per model so a new selection never wears the previous
model's badge. LiAI has no probe and no badge. This is the only gap that
costs a network round trip, and it is the one place where copying the
feature means adding behaviour rather than adding markup — hence a
ticket that asks before it builds.

## Copied, verbatim

- **Two stacked sheets**, search mounted underneath so query, results and
  scroll survive the details view (`:645-651`).
- **500ms debounce** on the query, matching `DEBOUNCE_DELAY`.
- **Filter chips** (author, sort) in a horizontal scroll under the search
  pill, replacing `EnhancedSearchBar`.
- **The results row's four facts**: author, time, downloads, likes, plus
  the gated "Requires Token" chip.
- **The details header**: author, vision tag, `timeAgo` long form,
  downloads, likes, and the trending chip at `trendingScore > 20`
  (`:767-769`, matching `DetailsView.tsx:118-127`).
- **The section title** naming the file kind — `en.json
  models.details.title`, carried as "Available GGUF Files" (`:770-776`).
- **GGUF-only file list.** `lib/models/huggingface.ts:562` filters
  `type === "file" && path.endsWith(".gguf")`, which is what the reference's
  `getLLMFiles` does; the extra `mmproj` filter at `HFModelSearch.tsx:421-425`
  hides projector files from the list while the vision sheet still offers
  them as pairing choices. Parity holds — checked, because the two filters
  read as redundant.
- **Per-file bookmark, cancel, pause, resume, and the vision pair decision.**
- **The four warning codes**, all present.

## Deliberate divergences (recorded, not changed)

1. **Search row anatomy.** The reference stacks author above title
   (`SearchView.tsx:99-107`); ours leads with the title and a type icon and
   puts `by {author}` beneath (`:557-576`), and adds a trailing
   `ChevronRight` the reference has no equivalent of. Both are defensible;
   neither is documented, which is the actual defect.
2. **Progress readout on the file row.** The reference paints a Hugging Face
   yellow gradient behind the row, width = progress
   (`ModelFileCard.tsx:263-271`). Ours uses the shared `DownloadProgressBar`
   plus a cancel button. The gradient is brand-coloured and would import a
   colour that exists nowhere in this design system.
3. **The `GGUF` chip** on every file row (`:463`) is ours alone, and it is
   constant — `getModelFiles` already guarantees GGUF, so the chip carries no
   information the row does not.
4. **Size readout.** Ours prints `4.03 GB + 812 MB projector` (`:498-502`);
   the reference prints the pair's total. Ours is more informative and
   costs one extra line at small widths.

## Landed since this audit

- **The split** (ticket-free, agreed separately): `HFModelSearch.tsx` is now
  the reference's four files — `HFModelSearch` (the flow), `HFSearchView`
  (its SearchView), `HFDetailsView` (its DetailsView) and `HFFileRow` (its
  ModelFileCard). Nine test files asserted against the old single file as
  source text; each now reads the file that owns that piece. Two
  side-effects of the split, both behaviour-preserving: the free-space poll
  moved into the sheet that keeps asking (`HFDetailsView`), and the
  hand-rolled copy of the learned-ceiling guard was deleted in favour of
  the existing `hooks/useLoadGuard.ts` (identical predicate, identical copy).
- **G3** (`.scratch/hf-model-card-parity/issues/03`): the file name is one
  line, middle-ellipsized, and pinned by
  `tests/hf-details-sheet.test.ts`.
- **G1, G2** (issues 01, 02): a no-results empty state, and a 1000ms
  duplicate-page guard on `onEndReached` (a ref, plus a `searchLoadingMore`
  check). Pinned by the new `tests/hf-search-view.test.ts`.
- **G4** (issue 04): one warning chip per row, reading as a count when more
  than one fires, opening the snackbar that already existed unwired. The
  snackbar now numbers its list when there is more than one warning, which
  is the reference's rule and improves the pre-existing download path too.
- **G6** (issue 06): the vision chip states whether vision is enabled, with
  the eye icon and chevron the reference has. Correction to that ticket's
  own acceptance: the chip was on a **32dp** target before, which
  `tests/touch-targets.test.ts` cannot catch (its blanket rule only flags
  `h-10`/`h-11`). The pill now sits inside a 48dp pressable.
- **Divergences 1-4** (issue 08): all four kept, each with a one-line "why"
  in the code. The ticket's screenshot item is closed — see the supersede
  note on the 2026-10-10 record.

- **G5** (issue 05): a downloaded file's control in the HF details sheet is
  now the destructive one — the delete glyph REPLACES the download button in
  that state, as the reference does (its download glyph becomes the delete
  glyph), so the row never shows two controls for one state.
  `DownloadButton`'s inert completed branch is untouched for the
  models-screen card. The confirm wording is now **shared** rather than
  copied: `confirmDeleteModel` lives in `ModelBits.tsx` and both surfaces
  call it, which also deleted `ModelCard`'s remove/delete ternary. Two
  surfaces that destroy a file can no longer drift on the one dialog that
  does it.

**G7** (issue 07, the MTP badge) is closed `wontfix` — deferred, not
rejected: it labels a capability the app cannot act on until speculative
decoding lands, and the probe is a network round trip on every repo opened.
Reopen that file when speculative decoding ships.

All seven gaps are now resolved: **six fixed** (G1-G6) and **one deferred
with a stated reason** (G7).

## Verification gap

Same shape as the 2026-10-10 record: `tests/hf-details-sheet.test.ts` and
`tests/model-card-anatomy.test.ts` assert **source text**, because the
runner cannot render native components. G3, G6 and the row anatomy are
layout and affordance claims — precisely the class that reads differently on
a device than in a class string. Nothing here has been looked at on a
screen. G1, G2, G5 and G7 are behaviour and can be pinned by tests that
read state.
