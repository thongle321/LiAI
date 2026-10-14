/** PocketPal font-size mirror (grilling Q1-Q7, "Yes all" confirmation).
 * Run: node --test tests/font-scale.test.ts */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const css = read("global.css");
const tokens = read("themes/tokens.ts");

describe("scale gains pocketpal's small rungs", () => {
  it("defines title 14/20, xs 11/16, micro 10/14 in css and ts", () => {
    assert.match(css, /--text-title: 14px;/);
    assert.match(css, /--text-title--line-height: 20px;/);
    assert.match(css, /--text-xs: 11px;/);
    assert.match(css, /--text-xs--line-height: 16px;/);
    assert.match(css, /--text-micro: 10px;/);
    assert.match(css, /--text-micro--line-height: 14px;/);
    assert.match(tokens, /title: \{ size: 14, lineHeight: 20/);
    assert.match(tokens, /xs: \{ size: 11, lineHeight: 16/);
    assert.match(tokens, /micro: \{ size: 10, lineHeight: 14/);
  });
});

describe("titles land on pocketpal titleSmall (Q2)", () => {
  it("chat + screen headers use text-title, not text-h2", () => {
    const chat = read("app/(drawer)/(tabs)/chat.tsx");
    assert.match(chat, /text-title/);
    assert.doesNotMatch(chat, /text-h2/);
    const screen = read("components/ScreenHeader.tsx");
    assert.match(screen, /text-title/);
    assert.doesNotMatch(screen, /text-h2/);
  });

  it("drawer header row is gone entirely (Q5=A)", () => {
    const drawer = read("components/AppDrawer.tsx");
    assert.doesNotMatch(drawer, /APP_NAME/);
    assert.doesNotMatch(drawer, /Close menu/);
    assert.doesNotMatch(drawer, /text-h2/);
  });

  it("sheet titles sit at their titleMedium 16 (shared surface)", () => {
    const sheet = read("components/Sheet.tsx");
    assert.match(sheet, /text-body-lg/);
    assert.doesNotMatch(sheet, /text-h3/);
  });
});

describe("settings drop section titles (Q6=B)", () => {
  it("SettingsSection renders no heading", () => {
    const rows = read("components/SettingsRows.tsx");
    assert.doesNotMatch(rows, /text-h3/);
    assert.doesNotMatch(rows, /\{title \? \(/);
  });
});

describe("chat body rises to pocketpal 16 (Q1)", () => {
  it("markdown body 16 + headings pinned 24/20/18/16 via ONE shared scale (Q4)", () => {
    const md = read("components/chat/MarkdownView.tsx");
    // No bare size literals left in the renderer: every rung comes from
    // themes/tokens.ts, so the bubble scale cannot drift into two copies
    // (Part 2 audit, P3 — the type tokens are the one source of truth).
    assert.doesNotMatch(md, /fontSize: \d/);
    assert.match(md, /typeScale\.bodyLg/); // body 16 + h4/h5/h6
    assert.match(md, /typeScale\.bodyMd/); // dense reasoning 14/20
    assert.match(md, /typeScale\.h2\.size/); // markdown h1 = 24
    assert.match(md, /typeScale\.h3\.size/); // markdown h2 = 20
    assert.match(md, /embeddedText\.markdownH3/); // the one size with no rung: 18
    assert.match(md, /embeddedText\.code/); // 13
    // The pinned VALUES live in the shared home now.
    const tokens = read("themes/tokens.ts");
    assert.match(tokens, /markdownH3: 18/);
    assert.match(tokens, /code: 13/);
  });

  it("code highlighter and Android Compose menus share the 14 rung", () => {
    for (const file of [
      "components/chat/CodeBlock.tsx",
      "components/PickerMenu.android.tsx",
      "components/ResetMenu.android.tsx",
    ]) {
      assert.doesNotMatch(
        read(file),
        /fontSize: \d/,
        `${file} must not carry a bare fontSize literal`,
      );
      assert.match(read(file), /typeScale\.bodyMd/, `${file} takes the 14/20 rung`);
    }
  });

  it("user bubble, composer input, menu rows at 16", () => {
    const item = read("components/chat/MessageListItem.tsx");
    assert.match(
      item,
      /<Text className="font-sans text-body-lg text-primary-text">\s*\{message\.text\}/,
      "user bubble body-lg",
    );
    assert.match(read("components/chat/ChatMenu.tsx"), /text-body-lg/);
    assert.match(read("components/chat/MessageInput.tsx"), /text-body-lg/);
  });

  it("reasoning block renders dense (their pin 14/20)", () => {
    const block = read("components/chat/ReasoningBlock.tsx");
    assert.match(block, /dense/);
    const md = read("components/chat/MarkdownView.tsx");
    assert.match(md, /dense/, "MarkdownView exposes the dense rung");
  });
});

describe("the small rungs land", () => {
  it("assistant footer timing at micro (10)", () => {
    // The footer moved from MessageListItem.tsx to MessageActions.tsx when
    // the duplicate token line was consolidated. The pin follows the code:
    // the intent is the RUNG, not which file holds it.
    assert.match(read("components/chat/MessageActions.tsx"), /text-micro/);
  });

  it("composer hints at xs (11), chip menu labels at 12", () => {
    const input = read("components/chat/MessageInput.tsx");
    assert.match(input, /text-xs/);
    assert.match(input, /text-body-sm/);
  });

  it("models + placeholder + dialog + search at their targets", () => {
    assert.match(read("components/models/ModelAccordion.tsx"), /text-title/);
    assert.match(read("components/models/AvailableModels.tsx"), /text-body-md/);
    assert.match(
      read("components/chat/ChatEmptyPlaceholder.tsx"),
      /text-body-lg/,
    );
    assert.match(read("components/chat/SessionList.tsx"), /text-body-lg/);
    assert.match(read("components/models/HFSearchView.tsx"), /text-body-lg/);
  });

  it("bottom nav label scales to 1.5x and the bar is measured, not pinned", () => {
    // The old pocketpal 11/14 pin is gone (Part 2 audit, P2, approved
    // refactor): the label follows the global caption rung and the OS
    // font setting up to 1.5x; the bar's REAL height flows to the
    // keyboard compensation through store/keyboard.ts's onLayout
    // measurement ((tabs)/_layout.tsx), so a grown bar cannot drift it.
    const nav = read("components/BottomNav.tsx");
    assert.doesNotMatch(nav, /"--text-caption": 11/, "the 11/14 pin must stay gone");
    assert.match(nav, /maxFontSizeMultiplier=\{1\.5\}/);
    // RN's absolute line-height does NOT scale with the OS font setting:
    // the label must track PixelRatio.getFontScale() or the enlarged
    // glyphs clip inside the caption's 16px box.
    assert.match(nav, /PixelRatio\.getFontScale\(\)/);
    // Class sum RESUMMED for the global caption box (16, not the pinned
    // 14): 1 border + 8 pt-2 + 40 icon + 16 label + 4 pb-1.
    assert.match(nav, /TAB_BAR_HEIGHT = 69/);
  });
});

describe("zones take their rungs (settings 16/11, gen 11/12)", () => {
  it("SettingsRows exports the provider and its labels consume it", () => {
    const rows = read("components/SettingsRows.tsx");
    assert.match(rows, /export function RowSizeProvider/);
    assert.match(rows, /createContext/);
  });

  it("SamplerRows wraps its card in the gen rungs", () => {
    const sam = read("components/SamplerRows.tsx");
    assert.match(sam, /RowSizeProvider/);
    assert.match(sam, /text-xs/);
    assert.match(sam, /text-body-sm/);
  });

  it("settings descriptions default to xs", () => {
    const rows = read("components/SettingsRows.tsx");
    assert.match(rows, /desc: "text-xs"/, "settings desc = 11");
  });
});
