
/** Contract tests for services/voice/voice-status.ts. */


import {
  bargeActionFor,
  showsReplyOverlay,
  voiceErrorAction,
  voiceModeStateLabel,
  voiceModeVerbLabel,
  voiceOrbStateFor,
  VOICE_MODE_LABEL,
  VOICE_MODE_STATE_LABEL,
  VOICE_MODE_VERB_LABEL,
  VOICE_STATUS_LABEL,
} from "../voice-status";

describe("muted status override", () => {
  it("a muted listen reads as Microphone off (reference l10n)", () => {
    expect(voiceModeStateLabel("listening", true)).toBe("MICROPHONE OFF");
    expect(voiceModeVerbLabel("listening", true)).toBe(
      "Tap the microphone to talk again",
    );
  });

  it("muted overrides every other phase's copy but listening", () => {
    for (const phase of [
      "closed",
      "starting",
      "transcribing",
      "thinking",
      "speaking",
    ] as const) {
      expect(voiceModeStateLabel(phase, true)).toBe(
        VOICE_MODE_STATE_LABEL[phase],
      );
      expect(voiceModeVerbLabel(phase, true)).toBe(
        VOICE_MODE_VERB_LABEL[phase],
      );
    }
  });

  it("unmuted sessions read the phase labels verbatim", () => {
    for (const phase of [
      "closed",
      "starting",
      "listening",
      "transcribing",
      "thinking",
      "speaking",
    ] as const) {
      expect(voiceModeStateLabel(phase, false)).toBe(
        VOICE_MODE_STATE_LABEL[phase],
      );
      expect(voiceModeVerbLabel(phase, false)).toBe(
        VOICE_MODE_VERB_LABEL[phase],
      );
    }
  });
});

describe("VOICE_STATUS_LABEL", () => {
  it("labels every phase for the status line", () => {
    expect(VOICE_STATUS_LABEL.idle).toEqual("Tap to talk");
    expect(VOICE_STATUS_LABEL.listening).toEqual("Listening");
    expect(VOICE_STATUS_LABEL.thinking).toEqual("Thinking");
    expect(VOICE_STATUS_LABEL.speaking).toEqual("Speaking");
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

/** VoiceOrbState via voiceOrbStateFor: expo-thinking-orbs' type is a type-only
 *  import here, so the suite pins the nine literals by string value. */
describe("voiceOrbStateFor", () => {
  it("a closed session uses disconnected; a dead one freezes as failed", () => {
    expect(voiceOrbStateFor("closed", false)).toEqual("disconnected");
    // An issue with no session is a dead gate (mic-blocked, no model,
    // failed start) — the frozen state matching it.
    expect(voiceOrbStateFor("closed", true)).toEqual("failed");
  });

  it("starting maps to connecting; transcribing maps to pre-connect-buffering", () => {
    expect(voiceOrbStateFor("starting", false)).toEqual("connecting");
    expect(voiceOrbStateFor("listening", false)).toEqual("listening");
    expect(voiceOrbStateFor("transcribing", false)).toEqual("pre-connect-buffering");
    expect(voiceOrbStateFor("thinking", false)).toEqual("thinking");
    expect(voiceOrbStateFor("speaking", false)).toEqual("speaking");
  });

  it("an issue mid-session does NOT freeze — the turn is still live", () => {
    // Transcribe failures set an issue and keep listening; the orb
    // tracks the machine, the text under it carries the problem.
    expect(voiceOrbStateFor("listening", true)).toEqual("listening");
    expect(voiceOrbStateFor("speaking", true)).toEqual("speaking");
  });
});

describe("VOICE_MODE_LABEL (verb-style, matches expo-thinking-orbs example)", () => {
  it("has a label for every VoiceModePhase", () => {
    expect(VOICE_MODE_LABEL.closed).toEqual("Waiting");
    expect(VOICE_MODE_LABEL.starting).toEqual("Connecting");
    expect(VOICE_MODE_LABEL.listening).toEqual("Listening");
    expect(VOICE_MODE_LABEL.transcribing).toEqual("Processing");
    expect(VOICE_MODE_LABEL.thinking).toEqual("Thinking");
    expect(VOICE_MODE_LABEL.speaking).toEqual("Speaking");
  });
});

describe("VOICE_MODE_STATE_LABEL (uppercase state names for main label)", () => {
  it("has uppercase state for every VoiceModePhase", () => {
    expect(VOICE_MODE_STATE_LABEL.closed).toEqual("WAITING");
    expect(VOICE_MODE_STATE_LABEL.starting).toEqual("CONNECTING");
    expect(VOICE_MODE_STATE_LABEL.listening).toEqual("LISTENING");
    expect(VOICE_MODE_STATE_LABEL.transcribing).toEqual("PROCESSING");
    expect(VOICE_MODE_STATE_LABEL.thinking).toEqual("THINKING");
    expect(VOICE_MODE_STATE_LABEL.speaking).toEqual("SPEAKING");
  });
});

describe("VOICE_MODE_VERB_LABEL (verb/description for secondary line)", () => {
  it("has verb for every VoiceModePhase", () => {
    expect(VOICE_MODE_VERB_LABEL.closed).toEqual("Waiting");
    expect(VOICE_MODE_VERB_LABEL.starting).toEqual("Connecting");
    expect(VOICE_MODE_VERB_LABEL.listening).toEqual("Listening");
    expect(VOICE_MODE_VERB_LABEL.transcribing).toEqual("Processing");
    expect(VOICE_MODE_VERB_LABEL.thinking).toEqual("Thinking");
    expect(VOICE_MODE_VERB_LABEL.speaking).toEqual("Speaking");
  });
});
