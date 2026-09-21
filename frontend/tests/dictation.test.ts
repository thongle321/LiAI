/** Contract tests for the dictation merge in frontend/lib/voiceListen.ts. */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { mergeDictation } from "../lib/voiceListen.ts";

describe("mergeDictation", () => {
  it("fills an empty draft with the transcript", () => {
    assert.equal(mergeDictation("", "hello world"), "hello world");
  });
  it("appends after existing draft text with one space", () => {
    assert.equal(mergeDictation("typed", "spoken"), "typed spoken");
  });
  it("keeps the base when the transcript is empty", () => {
    assert.equal(mergeDictation("typed", "   "), "typed");
  });
});
