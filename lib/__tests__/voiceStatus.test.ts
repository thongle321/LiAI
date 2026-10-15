
/** Contract tests for lib/voiceStatus.ts. */


import {
  bargeActionFor,
  showsReplyOverlay,
  voiceErrorAction,
  VOICE_STATUS_LABEL,
} from "../voiceStatus";

describe("VOICE_STATUS_LABEL", () => {
  it("labels every phase for the status line", () => {
    expect(VOICE_STATUS_LABEL.idle).toEqual("Tap to talk");
    expect(VOICE_STATUS_LABEL.listening).toEqual("Listening…");
    expect(VOICE_STATUS_LABEL.thinking).toEqual("Thinking…");
    expect(VOICE_STATUS_LABEL.speaking).toEqual("Speaking…");
  });
});

describe("showsReplyOverlay", () => {
  it("shows the Playing-audio block only while the AI replies", () => {
    expect(showsReplyOverlay("speaking")).toEqual(true);
    expect(showsReplyOverlay("listening")).toEqual(false);
    expect(showsReplyOverlay("thinking")).toEqual(false);
    expect(showsReplyOverlay("idle")).toEqual(false);
  });
});

describe("voiceErrorAction", () => {
  it("denied permission fails at once", () => {
    const a = voiceErrorAction(0, "not-allowed");
    expect(a.fatal).toEqual(true);
    expect(a.message).toMatch(/Microphone access/);
  });
  it("early failures nudge and keep listening", () => {
    const a = voiceErrorAction(0, "no-speech");
    expect(a.fatal).toEqual(false);
  });
  it("a long failure run gives up with clean copy (no raw code)", () => {
    const a = voiceErrorAction(99, "network");
    expect(a.fatal).toEqual(true);
    expect(a.message).toMatch(/trouble hearing you/i);
    // The raw recognizer code must never reach the UI (Q3).
    expect(a.message).not.toMatch(/network/);
  });
  it("throttling fails at once — retrying extends the ban", () => {
    const a = voiceErrorAction(0, "too-many-requests");
    expect(a.fatal).toEqual(true);
    expect(a.message).toMatch(/Too many voice requests/);
  });
  it("busy also throttles — retrying extends the ban", () => {
    const a = voiceErrorAction(0, "busy");
    expect(a.fatal).toEqual(true);
    expect(a.message).toMatch(/Too many voice requests/);
  });
});

describe("bargeActionFor", () => {
  it("maps each phase to its mic-tap action", () => {
    // Tap-to-talk: taps never start listening on their own — idle
    // begins, live taps stop back to idle, thinking is in-flight.
    expect(bargeActionFor("speaking")).toEqual("interrupt");
    expect(bargeActionFor("listening")).toEqual("stop");
    expect(bargeActionFor("thinking")).toEqual("ignore");
    expect(bargeActionFor("idle")).toEqual("begin");
  });
});
