/** The keyboard geometry, which is the one piece of maths every keyboard
 *  animation shares. Both are worklets called from the UI thread, and both are
 *  plain functions here so the JS thread can test them directly. */

import { keyboardOcclusion, TAB_BAR_HEIGHT_SEED } from "../keyboard.ts";

describe("keyboardOcclusion", () => {
  it("is the keyboard height, since the IME inset already spans the nav bar", () => {
    // The library reports NEGATIVE height while the keyboard is up.
    expect(keyboardOcclusion(-400, 0)).toBe(400);
  });

  it("subtracts the view's own bottom anchor and never goes negative", () => {
    expect(keyboardOcclusion(-400, 48)).toBe(352);
    // A view anchored below the keyboard's own extent rises by nothing.
    expect(keyboardOcclusion(-40, 48)).toBe(0);
    // Keyboard down.
    expect(keyboardOcclusion(0, 48)).toBe(0);
  });
});

describe("TAB_BAR_HEIGHT_SEED", () => {
  it("is the bar's class sum at default font scale, and only an estimate", () => {
    // The bar's own onLayout replaces this; the test pins that the seed stays
    // a plausible positive number rather than tracking a value it cannot know.
    expect(TAB_BAR_HEIGHT_SEED).toBeGreaterThan(0);
    expect(Number.isInteger(TAB_BAR_HEIGHT_SEED)).toBe(true);
  });
});