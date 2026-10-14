const assert: any = {
  ok: (v: unknown, msg?: string) => expect(v).toBeTruthy(),
  equal: (a: unknown, b: unknown, msg?: string) => expect(a).toEqual(b),
  deepEqual: (a: unknown, b: unknown, msg?: string) => expect(a).toEqual(b),
  strictEqual: (a: unknown, b: unknown, msg?: string) => expect(a).toBe(b),
  notEqual: (a: unknown, b: unknown, msg?: string) => expect(a).not.toEqual(b),
  notDeepEqual: (a: unknown, b: unknown, msg?: string) => expect(a).not.toEqual(b),
  match: (value: string, re: RegExp | string, msg?: string) => expect(value).toMatch(re as any),
  doesNotMatch: (value: string, re: RegExp | string, msg?: string) => expect(value).not.toMatch(re as any),
  throws: (fn: () => void, re?: RegExp | string, msg?: string) => expect(fn).toThrow(re as any),
  doesNotThrow: (fn: () => void, msg?: string) => expect(fn).not.toThrow(),
  rejects: async (input: any, expected?: any, msg?: string) => {
    let err: unknown;
    const p = typeof input === "function" ? input() : input;
    try { await p; } catch (e) { err = e; }
    if (err === undefined) throw new Error("Expected promise to reject, but it resolved");
    if (expected === undefined) return;
    if (typeof expected === "function") {
      if (expected.prototype) { if (!(err instanceof expected)) throw new Error(msg ?? "rejected not instance"); }
      else if (!expected(err)) throw new Error(msg ?? "rejected did not satisfy");
    } else if (expected instanceof RegExp) {
      if (!expected.test(String((err as Error)?.message ?? err))) throw new Error(msg ?? "rejected message did not match");
    } else if (typeof expected === "string") {
      if (!String((err as Error)?.message ?? err).includes(expected)) throw new Error(msg ?? "rejected message did not include");
    }
  },
};

import { readFileSync } from "node:fs";

import { specCanSeeImages } from "../mmproj";

// vision-series 03: the attach affordance follows the SAME capability rule
// the send gate and the engine load use — disabled-with-hint when the
// active model cannot see, enabled when it can, live on model switch.

const specs = [
  {
    id: "v1",
    downloadStatus: "completed",
    projector: { name: "mmproj-v-f16.gguf", size: 90, downloadUrl: "u2" },
  },
  { id: "t1", downloadStatus: "completed" },
  {
    id: "half",
    downloadStatus: "downloading",
    projector: { name: "mmproj-h.gguf", size: 1, downloadUrl: "u" },
  },
] as const;

describe("specCanSeeImages", () => {
  it("is true for a completed local vision pair", () => {
    assert.equal(specCanSeeImages(specs, "v1", "local"), true);
  });

  it("is false for every cannot-see case", () => {
    assert.equal(specCanSeeImages(specs, "t1", "local"), false, "no projector");
    assert.equal(specCanSeeImages(specs, "half", "local"), false, "download incomplete");
    assert.equal(specCanSeeImages(specs, "v1", "remote"), false, "remote is ticket 04");
    assert.equal(specCanSeeImages(specs, null, "local"), false, "no active model");
  });
});

describe("the composer gates the attach affordance on it", () => {
  it("the hook reads the SAME rule, synchronously", () => {
    const src = readFileSync("hooks/useMultimodalAvailable.ts", "utf8");
    assert.match(src, /canSeeImages/, "one rule, one source");
    assert.match(src, /useModelStore/, "reactive to model switches");
  });

  it("the plus button is always rendered, disabled-with-hint when blind", () => {
    const src = readFileSync("components/chat/MessageInput.tsx", "utf8");
    assert.match(src, /useMultimodalAvailable/, "reads the hook");
    assert.match(src, /disabled=\{!modelReady \|\| !canSee\}/, "disabled, not hidden");
    assert.match(
      src,
      /"This model can't see images"/,
      "the established can't-see wording is the hint",
    );
  });
});
