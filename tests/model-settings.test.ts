/** Settings parse tests. Run: node --test frontend/tests/model-settings.test.ts */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_MODEL_SETTINGS,
  parseModelSettings,
  parseModelSettingsMap,
} from "../lib/model-settings.ts";

describe("parseModelSettings", () => {
  it("returns defaults for missing/invalid input", () => {
    for (const bad of [null, undefined, 42, "x", [], true]) {
      assert.deepEqual(parseModelSettings(bad), DEFAULT_MODEL_SETTINGS);
    }
  });

  it("fills missing fields, drops non-string stop words", () => {
    assert.deepEqual(
      parseModelSettings({ displayName: "Mini", stopWords: ["a", 1, null] }),
      { displayName: "Mini", systemPrompt: "", stopWords: ["a"] },
    );
  });

  it("keeps a full valid entry", () => {
    const full = { displayName: "N", systemPrompt: "Be nice", stopWords: ["x"] };
    assert.deepEqual(parseModelSettings(full), full);
  });
});

describe("parseModelSettingsMap", () => {
  it("returns {} for empty/corrupt JSON", () => {
    assert.deepEqual(parseModelSettingsMap(null), {});
    assert.deepEqual(parseModelSettingsMap(""), {});
    assert.deepEqual(parseModelSettingsMap("not json"), {});
    assert.deepEqual(parseModelSettingsMap("[1,2]"), {});
  });

  it("sanitizes each entry", () => {
    assert.deepEqual(
      parseModelSettingsMap(JSON.stringify({ m1: { displayName: "A" }, m2: 7 })),
      { m1: { displayName: "A", systemPrompt: "", stopWords: [] }, m2: { ...DEFAULT_MODEL_SETTINGS } },
    );
  });
});
