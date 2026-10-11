# 2026-10-10 — model card: copy the anatomy, keep the tokens

**Trigger.** A screenshot comparison (`myapp_card.jpg` vs `pocketpal_card.jpg`)
showed the model cards running flush to the window edge, and asked for
PocketPal's models-settings card to be studied and its architecture copied.

**Decision.** Copy PocketPal's *anatomy* — the element tree and the space it
divides — and re-derive every *token* against `DESIGN.md`. This is the same
rule the Settings sheet port followed: parity is a licence to copy structure,
never a licence to copy a value. The card's 24px radius is the standing proof
of why that distinction has to be written down: it was PocketPal's number,
lifted whole, and it outlived several passes because nothing asserted it.

Reference: `pocketpal-ai/src/screens/ModelsScreen/ModelCard/ModelCard.tsx`
and its `styles.ts`. Ours: `components/models/ModelCard.tsx`,
`components/models/ModelBits.tsx`, `components/models/ModelAccordion.tsx`,
`app/(drawer)/models.tsx`. Locked by `tests/model-card-anatomy.test.ts`
(source assertions — the card mounts native bits, so the runner cannot render
it).

## The reported bug

The card was the only list surface in the app with no screen gutter:

| | PocketPal | LiAI before | LiAI now |
|---|---|---|---|
| screen container | `padding: 2` | none | `px-5` on the list |
| card margin | `margin: 6` | none | none (the list owns it) |
| **total inset** | **8px** | **0px** | **20px** |

`MessageList.tsx` (`contentContainerClassName="p-5"`) and
`app/onboarding/model.tsx` (`ContentColumn className="p-5"`) already carried
the 20px gutter, so the models screen was the outlier against its own design
system, not just against the reference. 20px rather than 8px because DESIGN.md
fixes the gutter at one `5` step on every edge.

**Horizontal only (`px-5`), not `p-5` like those two.** The horizontal inset is
the bug. The vertical edges already have single owners: the top is where
`ScreenHeader` ends and the group header starts, so a list `pt` would stack a
second top inset — DESIGN.md's "gutters are owned by one layer" is about
exactly that; and the bottom is the runtime FAB reserve
(`contentContainerStyle={{ paddingBottom: FAB_STACK_HEIGHT }}`), which an
inline style overrides anyway, so a class `pb` would be dead code. `p-5` would
have bought 20px of dead space above the first group header and lost nothing
the list actually needs.

The group header consequently dropped from `px-3` to `px-1`, so it lands at
24px — just inside the cards at 20px, the same relationship PocketPal has
(header 16px vs cards 8px). Two insets on the header would have stacked the
gutter, which DESIGN.md calls out as "the defect, not a style choice".

## Copied, verbatim

- **The layered interior.** PocketPal's `compactHeader` carries its own
  padding and then ONE `cardContent` wrapper carries it again for everything
  below — warnings, progress, the action row, and the expanded details. LiAI
  previously gave each region its own `px-4`. The action row and the details
  now carry none, which is what gives the header, the scrolled content and
  the expansion one shared left edge.
- **The header's size cluster.** A `Cpu` glyph before the size text,
  reference `styles.sizeInfo`. Ours runs the glyph at 12px rather than the
  reference's 10px, the caption size it sits beside, because 10px is off this
  system's scale.
- **The details are a continuation, not a region.** No `border-t` re-opens a
  divider inside the card; spacing plus the card's own 1px hairline separate
  them, per DESIGN.md's "cards are open white rectangles".
- **The load glyph pair.** A play circle while loadable, an eject once loaded
  (`renderModelLoadButton`), replacing the `Power` glyph that served both
  states.
- **The expand glyph pair.** `ChevronsUpDown` collapsed,
  `ChevronsDownUp` open — the reference's
  `ChevronSelectorVertical`/`ChevronSelectorExpandedVertical`. Real icons
  rather than a rotation: a style-rotated lucide glyph rendered invisible on
  this device once before.
- **The Load/Offload tonal ground.** PocketPal's `btnPrimary` trio
  (`#eff6ff` / `#bfdbff` / `#1447e6`). LiAI's own tokens carry it exactly —
  `#eff6ff` *is* `surface-3` — so this cost no new colour.
- **The Download ground.** PocketPal's `btnDownload` trio
  (`#ecfdf5` / `#bbf7d0` / `#047857`), carried by three new tokens pinned in
  `tests/color-contrast.test.ts`.
- **Icon buttons sit bare in the target.** No wrapper box. DESIGN.md's own
  rule ("pad the hit area, not the circle") and the reference's
  `styles.iconButton` agree; the box this card drew was decoration that also
  implied a second control.

## Retired

- **24px card radius → 8px.** PocketPal's value, replaced by DESIGN.md's
  Default step. This is the correction the whole record exists to name.
- **40px-bordered icon-button boxes** → bare 48px pressables.
- **`Power`**, **`ChevronRight`/`ChevronDown`**, and each region's own `px-4`.

## Deliberate divergences

1. **The download button's border is the mark step, not the reference's.**
   `#bbf7d0` is 1.21:1 and could never clear the 3:1 non-text floor here, so
   the border takes `#059669` instead. Visual difference is a hair; the
   alternative is a button boundary that a low-vision user cannot see.
2. **Touch targets stay 48dp.** The reference's icon buttons are 40px and its
   primary action is 40px tall. The 48×48 floor is a binding accessibility
   requirement in this product (`tests/touch-targets.test.ts`), and a 40px
   pressable fails it.
3. **Card padding is 16px, not the reference's 18px.** DESIGN.md's row-card
   case is 16px horizontal / 12px vertical.
4. **`Cpu` is 12px, not 10px** — the reference's value is off this system's
   4px-grounded type scale.
5. **The preset card is untouched, structurally.** PocketPal renders
   "Available to Download" with the *same* `ModelCard` — it has no collapsed,
   expand-to-reach-quantizations card at all
   (`ModelsScreen.tsx:358-372`). Matching it there would mean deleting the
   preset catalogue, including the onboarding model picker that shares the
   component. The gutter and radius fix apply to it; its shape does not
   change.
6. **Pause/Resume and "Offload" stay** — carried over from the earlier
   slice-2 record, unchanged here.
7. **`alert-tint` is documented but never implemented.** DESIGN.md's
   frontmatter declares `alert-tint: "rgba(239, 68, 68, 0.12)"` and its *Tints*
   section makes it "the fill of destructive icon buttons and error chips",
   but neither `global.css` nor `themes/tokens.ts` defines it, so no
   `bg-alert-tint` class exists. Three sites carry the closest thing instead —
   `bg-error/10` (#B91C1C at 10%) in the model card's destructive icon button,
   `HFModelSearch`'s error chip and `ContextFullBanner`'s error banner — and
   the glyph alongside is `error` (#B91C1C), not `error-mark` (#EF4444).
   Left as is: the mirror test parses `#RRGGBB` only, so an rgba token would
   need that parser extended, and touching three error grounds across
   surfaces this change does not otherwise reach is a separate piece of work.
   The code comment now says this instead of claiming the values.

## Verification gap

Layout is source-asserted, not rendered: the card mounts native components and
`node --test` cannot draw it. The gutter, the layered wrapper, the radius, the
bare icon buttons, the glyph pairs and both tonal grounds are each pinned, but
*nothing here has been looked at on a device*. The tonal grounds and the
download green are the two values most worth a screenshot — they are new
colours, and a tonal fill interacting with the card's hairline is exactly the
kind of thing that reads differently in person than in a class string.
