/** The reconciled keyboard-occlusion value. Run: node --test tests/keyboard.test.ts */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { keyboardOcclusion } from "../lib/keyboard.ts";

describe("keyboardOcclusion", () => {
  it("is zero while the keyboard is closed", () => {
    assert.equal(keyboardOcclusion(0), 0);
    assert.equal(keyboardOcclusion(0, 48), 0);
  });

  it("rises by the FULL height for a view anchored at the physical bottom", () => {
    // The chat composer: `absolute inset-x-0 bottom-0`, so its bottom edge IS
    // the bottom of the screen and it must rise by everything the keyboard
    // takes. This was the bug - the composer was passing insets.bottom while
    // anchored at 0, so it under-lifted by exactly the navigation bar height,
    // which is the reported "the chat input is not above the keyboard".
    // The anchor defaults to 0, so a caller that forgets cannot get this wrong.
    assert.equal(keyboardOcclusion(400), 400);
    assert.equal(keyboardOcclusion(-400), 400);
  });

  it("ignores the sign of the reported height", () => {
    // react-native-keyboard-controller negates the native height
    // (`heightSV.value = -event.height` in KeyboardProvider), so height is
    // NEGATIVE while the keyboard is up. A naive `translateY: -height.value`
    // then moves content DOWN by the keyboard height, which is how the vision
    // panel appeared to sink instead of rise.
    assert.equal(keyboardOcclusion(-400, 0), keyboardOcclusion(400, 0));
    assert.equal(keyboardOcclusion(-400, 48), keyboardOcclusion(400, 48));
  });

  it("rises by height MINUS the anchor for a view sitting above the nav bar", () => {
    // The vision panel is `style={[{ bottom: insets.bottom }]}` - anchored
    // above the navigation bar, not on it. The keyboard height already spans
    // that bar, so the panel must not rise by all of it or it floats a gap
    // above the keyboard.
    assert.equal(keyboardOcclusion(400, 48), 352);
    assert.equal(keyboardOcclusion(-400, 48), 352);
  });

  it("clamps at zero rather than translating the other way", () => {
    // A keyboard shorter than the anchor (a number pad on a tall-inset device)
    // must not push content downwards.
    assert.equal(keyboardOcclusion(20, 48), 0);
    assert.equal(keyboardOcclusion(-20, 48), 0);
  });
});
