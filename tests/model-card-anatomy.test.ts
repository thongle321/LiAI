/** Model-card anatomy (PocketPal parity, LiAI tokens).
 *
 * Source-level assertions, for the same reason `hf-details-sheet.test.ts` and
 * `models-dialog-copy.test.ts` are: the card mounts native bits and the app
 * is not renderable under `node --test`, so the runner can never see its
 * layout. What it CAN see is the class strings and the element tree, and that
 * is where this card's history lives — its 24px radius and its boxed icon
 * buttons both survived several passes unchallenged because nothing asserted
 * them either way.
 *
 * The decisions pinned here came out of the 2026-10-10 grilling round and are
 * recorded in DESIGN.md's Cards section plus
 * `docs/research/2026-10-10-model-card-architecture-parity.md`. Read that
 * record for why a given value was chosen; this file only holds the line.
 *
 * Run: node --test tests/model-card-anatomy.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const ROOT = path.join(import.meta.dirname, "..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

/** Comments stripped: several guards below assert the ABSENCE of a class, and
 *  this file's own neighbours legitimately name them while explaining the
 *  history. */
function code(rel: string): string {
  return read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

const CARD = code("components/models/ModelCard.tsx");
const BITS = code("components/models/ModelBits.tsx");
const ACCORDION = code("components/models/ModelAccordion.tsx");
const SCREEN = code("app/(drawer)/models.tsx");
const ALL_MODELS_UI = [
  CARD,
  BITS,
  ACCORDION,
  code("components/models/AvailableModels.tsx"),
  code("components/models/ModelCardDetails.tsx"),
];

describe("model card radius", () => {
  it("uses the Default 8px step everywhere, never PocketPal's 24px", () => {
    // DESIGN.md's Radius Names Rule: Default (8px) is the workhorse for
    // "buttons, inputs, cards"; X-Large (16px) is reserved. The 24px this
    // card carried was PocketPal's value taken wholesale, and it was the one
    // card that never got re-derived against the design system.
    //
    // `rounded-full` and small inner radii are NOT the target: DESIGN.md
    // permits circles for "things you press", and the progress track's 5px
    // fill is the documented inner-radius case. Only the card-sized steps
    // outside Default are forbidden.
    for (const src of ALL_MODELS_UI) {
      assert.doesNotMatch(
        src,
        /rounded-(?:\[24px\]|2xl|3xl|\[32px\])/,
        "no card in the models cluster may carry a radius above the Default step",
      );
    }
    assert.match(
      CARD,
      /const CARD =\s*\n?\s*"[^"]*rounded-lg[^"]*"/,
      "the card shell must declare the Default 8px step",
    );
  });
});

describe("the card's layered interior", () => {
  it("owns its horizontal padding in ONE wrapper, not per region", () => {
    // PocketPal's cardContent (styles.ts:19-23): the warnings, the progress
    // bar, the action row and the expanded details all sit inside one view
    // carrying the horizontal padding, rather than each region repeating it.
    // The wrapper is `px-4`; the action row inside it must NOT also carry px.
    const wrapper = CARD.match(/<View className="px-4 pb-3">/);
    assert.ok(wrapper, "the card needs one content wrapper owning the padding");

    const actionRow = CARD.match(
      /<View className="mt-3 flex-row flex-wrap items-center gap-2">/,
    );
    assert.ok(actionRow, "the action row must not carry its own horizontal padding");

    // And the details region is a continuation, not a second card: PocketPal's
    // detailsContent has no divider either, and DESIGN.md separates with
    // spacing plus the card's own 1px hairline.
    assert.doesNotMatch(
      CARD,
      /<Animated\.View[\s\S]*?border-t border-border/,
      "the expanded details must not re-open a divider inside the card",
    );
  });

  it("keeps the header's Cpu chip before the size", () => {
    // PocketPal's sizeInfo (styles.ts:86-99): a 10px CpuChip, then the size
    // text. Ours runs the glyph at the caption size it sits beside.
    assert.match(CARD, /<Cpu size=\{12\}/, "the size cluster needs its Cpu chip");
    assert.match(
      CARD,
      /<View className="flex-row items-center gap-1">\s*<Cpu size=\{12\}[\s\S]*?formatBytes\(fileBytes\)[\s\S]*?<\/View>/,
      "the size cluster must lead with its Cpu chip",
    );
  });
});

describe("icon buttons", () => {
  it("puts the icon straight in the 48px target, with no wrapper box", () => {
    // DESIGN.md l.377: "the visual circle is 40px; the touch target is 48×48dp
    // minimum. Pad the hit area, not the circle." PocketPal's own
    // styles.iconButton is a bare 40px touchable. The box this card wrapped
    // its icons in was decoration that also implied a second control.
    assert.match(CARD, /const ICON_BUTTON = "h-12 w-12 items-center justify-center"/);
    assert.doesNotMatch(
      CARD,
      /h-10 w-10/,
      "no 40px inner box: the icon sits directly in the pressable",
    );
    assert.doesNotMatch(
      CARD,
      /ICON_SURFACE/,
      "the removed box constant must not return under a new name",
    );
  });

  it("keeps Alert Tint on the destructive one only", () => {
    // DESIGN.md l.238 names Alert Tint as "the fill of destructive icon
    // buttons" — so trash keeps a ground while settings and expand stay bare.
    assert.match(CARD, /const ICON_DESTRUCTIVE = "rounded-full bg-error\/10"/);
    const destructiveUses = CARD.match(/\$\{ICON_DESTRUCTIVE\}/g) ?? [];
    assert.equal(
      destructiveUses.length,
      2,
      "the model card and the remote-provider card each carry exactly one destructive icon button",
    );
  });
});

describe("action glyphs", () => {
  it("uses PocketPal's expand pair, not a rotated chevron", () => {
    // ChevronSelectorVertical collapsed / ChevronSelectorExpandedVertical
    // open (ModelCard.tsx expand-details-button). Real icons: a style-rotated
    // lucide glyph rendered invisible on this phone once before.
    assert.match(CARD, /<ChevronsUpDown size=\{20\}/, "collapsed");
    assert.match(CARD, /<ChevronsDownUp size=\{20\}/, "expanded");
    assert.doesNotMatch(CARD, /<ChevronRight/, "the right-pointing chevron is gone");
    assert.doesNotMatch(CARD, /<ChevronDown/, "the plain down chevron is gone");
  });

  it("uses the reference's Play/Eject pair on Load/Offload, not Power", () => {
    // ModelCard.tsx renderModelLoadButton: play-circle-outline while
    // loadable, eject once loaded. The label already names the state, so the
    // icon reinforces rather than competes.
    assert.match(CARD, /<Play size=\{16\}/, "loadable");
    assert.match(CARD, /<Eject size=\{16\}/, "loaded");
    assert.doesNotMatch(CARD, /<Power/, "the power glyph is gone");
  });
});

describe("tonal buttons", () => {
  it("carries the Load/Offload button on the tonal class", () => {
    // PocketPal's btnPrimary trio (#eff6ff / #bfdbff / #1447e6). LiAI's own
    // tokens carry it: Surface Tint ground, Signal Mark border, Signal label
    // — the tonal class owns all three so no call site composes them.
    assert.match(CARD, /className="btn btn--tonal flex-1"/);
    const css = read("global.css");
    assert.match(
      css,
      /\.btn--tonal\s*\{[^}]*background-color: #eff6ff/,
      "the tonal class needs its Surface Tint ground",
    );
    assert.match(
      css,
      /\.btn--tonal\s*\{[^}]*border-color: #3882f6/,
      "the tonal class needs its Signal Mark border",
    );
    // And it must not be a second solid blue: the One Signal Rule says the
    // primary fill marks exactly one thing per screen.
    assert.doesNotMatch(
      css,
      /\.btn--tonal\s*\{[^}]*background-color: #2563eb/,
      "the tonal button must not take the solid primary fill",
    );
  });

  it("carries Download on the green trio", () => {
    // PocketPal's btnDownload (#ecfdf5 / #bbf7d0 / #047857). Its border value
    // is 1.21:1 and could never clear the 3:1 non-text floor, so the border
    // takes the mark step and the ground/label the fill and text steps —
    // all three are tokens, mirrored in themes/tokens.ts, and enforced in
    // tests/color-contrast.test.ts.
    assert.match(
      BITS,
      /border-success-mark bg-success-fill/,
      "the enabled Download button needs its green ground and mark border",
    );
    assert.match(BITS, /text-success-deep/, "the label needs the 4.5:1 green step");
    assert.doesNotMatch(
      BITS,
      /border-border bg-surface-1 px-3/,
      "the neutral outline is gone from the enabled state",
    );
  });
});

describe("the screen gutter", () => {
  it("is applied once, by the list, and nowhere else stacks it", () => {
    // DESIGN.md: "The screen gutter is one 5 step (20px) on every edge" and
    // "Gutters are owned by one layer. A child that also insets itself stacks
    // the gutter; that is the defect." The models screen was the only list
    // without one, which is what pushed cards to the window edge.
    assert.equal(
      SCREEN.match(/contentContainerClassName="px-5"/g)?.length ?? 0,
      1,
      "the models list must carry exactly the 20px gutter",
    );
    // Any second px on a CONTENT container would stack the gutter — but the
    // ScreenHeader and the outer SafeAreaView own their own padding, so the
    // check is scoped to the list's content container.
    assert.doesNotMatch(
      SCREEN,
      /contentContainerClassName="(?!px-5")[^"]*\bpx-/,
      "the list's own classes must not double the gutter with a second px",
    );

    // The accordion header therefore lands at 24px — just inside the cards at
    // 20px, the relationship PocketPal has (header 16, cards 8).
    assert.match(
      ACCORDION,
      /rounded-lg px-1/,
      "the group header must not stack a second inset on the list gutter",
    );
  });
});
