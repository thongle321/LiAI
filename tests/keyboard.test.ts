/** The reconciled keyboard-occlusion value. Run: node --test tests/keyboard.test.ts */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { keyboardOcclusion } from "../lib/keyboard.ts";

describe("keyboardOcclusion", () => {
  it("is zero while the keyboard is closed", () => {
    assert.equal(keyboardOcclusion(0, 0), 0);
    assert.equal(keyboardOcclusion(0, 48), 0);
  });

  it("is the full height when there is no bottom inset", () => {
    assert.equal(keyboardOcclusion(400, 0), 400);
  });

  it("ignores the sign of the reported height", () => {
    // react-native-keyboard-controller reports a NEGATIVE height while the
    // keyboard is up on some platforms. A naive `translateY: -height.value`
    // then moves the panel DOWN by the keyboard height, which is how the
    // vision panel appeared to sink instead of rise.
    assert.equal(keyboardOcclusion(-400, 0), 400);
    assert.equal(keyboardOcclusion(400, 0), keyboardOcclusion(-400, 0));
  });

  it("subtracts the bottom inset the IME already covers", () => {
    // The IME inset spans the navigation bar, so translating by the raw
    // height overshoots by the inset.
    assert.equal(keyboardOcclusion(400, 48), 352);
    assert.equal(keyboardOcclusion(-400, 48), 352);
  });

  it("clamps at zero rather than going negative", () => {
    // A short keyboard (e.g. a number pad) can measure shorter than the
    // safe-area inset; translating by a negative amount would push content
    // the wrong way.
    assert.equal(keyboardOcclusion(20, 48), 0);
    assert.equal(keyboardOcclusion(-20, 48), 0);
  });
});
