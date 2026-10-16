import {
  DEFAULT_MODEL_SETTINGS,
  parseModelSettings,
  parseModelSettingsMap,
} from "../model-settings";

describe("parseModelSettings", () => {
  it("returns defaults for missing/invalid input", () => {
    for (const bad of [null, undefined, 42, "x", [], true]) {
      expect(parseModelSettings(bad)).toEqual(DEFAULT_MODEL_SETTINGS);
    }
  });
  it("fills missing fields, drops non-string stop words", () => {
    expect(
      parseModelSettings({ displayName: "Mini", stopWords: ["a", 1, null] }),
    ).toEqual({
      ...DEFAULT_MODEL_SETTINGS,
      displayName: "Mini",
      stopWords: ["a"],
    });
  });
});
describe("parseModelSettingsMap", () => {
  it("returns {} for empty/corrupt JSON", () => {
    expect(parseModelSettingsMap(null)).toEqual({});
    expect(parseModelSettingsMap("")).toEqual({});
    expect(parseModelSettingsMap("not json")).toEqual({});
    expect(parseModelSettingsMap("[1,2]")).toEqual({});
  });
  it("sanitizes each entry", () => {
    expect(
      parseModelSettingsMap(JSON.stringify({ m1: { displayName: "A" }, m2: 7 })),
    ).toEqual({
      m1: { ...DEFAULT_MODEL_SETTINGS, displayName: "A" },
      m2: { ...DEFAULT_MODEL_SETTINGS },
    });
  });
});
