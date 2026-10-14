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

/** Contract tests for frontend/lib/voiceStatus.ts. */


import {
  bargeActionFor,
  showsReplyOverlay,
  voiceErrorAction,
  VOICE_STATUS_LABEL,
} from "../voiceStatus";

describe("VOICE_STATUS_LABEL", () => {
  it("labels every phase for the status line", () => {
    assert.equal(VOICE_STATUS_LABEL.idle, "Tap to talk");
    assert.equal(VOICE_STATUS_LABEL.listening, "Listening…");
    assert.equal(VOICE_STATUS_LABEL.thinking, "Thinking…");
    assert.equal(VOICE_STATUS_LABEL.speaking, "Speaking…");
  });
});

describe("showsReplyOverlay", () => {
  it("shows the Playing-audio block only while the AI replies", () => {
    assert.equal(showsReplyOverlay("speaking"), true);
    assert.equal(showsReplyOverlay("listening"), false);
    assert.equal(showsReplyOverlay("thinking"), false);
    assert.equal(showsReplyOverlay("idle"), false);
  });
});

describe("voiceErrorAction", () => {
  it("denied permission fails at once", () => {
    const a = voiceErrorAction(0, "not-allowed");
    assert.equal(a.fatal, true);
    assert.match(a.message, /Microphone access/);
  });
  it("early failures nudge and keep listening", () => {
    const a = voiceErrorAction(0, "no-speech");
    assert.equal(a.fatal, false);
  });
  it("a long failure run gives up with clean copy (no raw code)", () => {
    const a = voiceErrorAction(99, "network");
    assert.equal(a.fatal, true);
    assert.match(a.message, /trouble hearing you/i);
    // The raw recognizer code must never reach the UI (Q3).
    assert.doesNotMatch(a.message, /network/);
  });
  it("throttling fails at once — retrying extends the ban", () => {
    const a = voiceErrorAction(0, "too-many-requests");
    assert.equal(a.fatal, true);
    assert.match(a.message, /Too many voice requests/);
  });
  it("busy also throttles — retrying extends the ban", () => {
    const a = voiceErrorAction(0, "busy");
    assert.equal(a.fatal, true);
    assert.match(a.message, /Too many voice requests/);
  });
});

describe("bargeActionFor", () => {
  it("maps each phase to its mic-tap action", () => {
    // Tap-to-talk: taps never start listening on their own — idle
    // begins, live taps stop back to idle, thinking is in-flight.
    assert.equal(bargeActionFor("speaking"), "interrupt");
    assert.equal(bargeActionFor("listening"), "stop");
    assert.equal(bargeActionFor("thinking"), "ignore");
    assert.equal(bargeActionFor("idle"), "begin");
  });
});
