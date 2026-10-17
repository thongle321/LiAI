/** Contract tests for services/tts//voiceUi.ts — the rules that decide what an
 *  engine card's body shows. Pure functions, so no React and no native
 *  module (which is why the extraction-phase test is a literal rather than
 *  a call into the package's own `isActiveExtractionPhase`). */

import {
  canStartInstall,
  downloadLine,
  engineGroupState,
  ringFraction,
  type EngineGroupState,
} from "../voiceUi";
import type { TtsModelStatus } from "../download";

const KOKORO_BYTES = 103_248_205;

describe("engineGroupState", () => {
  it("offers the install action for an absent or uninstalled model", () => {
    expect(engineGroupState(null)).toEqual({ kind: "install" });
    expect(
      engineGroupState({ state: "not_installed", percent: 0 }),
    ).toEqual({ kind: "install" });
  });

  it("reports extraction as its own phase, because percent rewinds there", () => {
    const extracting = engineGroupState({
      state: "downloading",
      percent: 40,
      phase: "extracting",
    });
    expect(extracting).toEqual({
      kind: "downloading",
      percent: 40,
      extracting: true,
    });
    expect(
      engineGroupState({
        state: "downloading",
        percent: 42,
        phase: "extracting_resume_skipping",
      }),
    ).toMatchObject({ extracting: true });
    expect(
      engineGroupState({ state: "downloading", percent: 42, phase: "downloading" }),
    ).toEqual({ kind: "downloading", percent: 42, extracting: false });
  });

  it("keeps a paused transfer resumable rather than an error", () => {
    expect(
      engineGroupState({ state: "paused", percent: 55 }),
    ).toEqual({ kind: "paused", percent: 55 });
    expect(engineGroupState({ state: "error", percent: 0, error: "boom" })).toEqual({
      kind: "error",
      message: "boom",
    });
    expect(engineGroupState({ state: "ready", percent: 100 })).toEqual({ kind: "ready" });
  });
});

describe("downloadLine", () => {
  const state = (s: EngineGroupState): string | null => downloadLine(s, KOKORO_BYTES);

  it("shows derived MB against the whole size while bytes arrive", () => {
    expect(
      state({ kind: "downloading", percent: 42, extracting: false }),
    ).toBe("Downloading… 42% · 43 / 103 MB");
  });

  it("says Extracting instead of a percent that restarts from zero", () => {
    expect(state({ kind: "downloading", percent: 40, extracting: true })).toBe(
      "Extracting… 40%",
    );
  });

  it("marks a paused transfer and leaves the other states to the tagline", () => {
    expect(state({ kind: "paused", percent: 55 })).toBe("Paused · 55%");
    expect(state({ kind: "install" })).toBeNull();
    expect(state({ kind: "ready" })).toBeNull();
  });
});

describe("ringFraction", () => {
  it("fills the header arc from the live transfer's own percent", () => {
    expect(ringFraction({ kind: "downloading", percent: 42, extracting: false })).toBe(0.42);
    expect(ringFraction({ kind: "downloading", percent: 0, extracting: false })).toBe(0);
    expect(ringFraction({ kind: "downloading", percent: 100, extracting: false })).toBe(1);
  });

  /** The archive reports over uncompressed bytes once unpacking starts, so
   *  percent restarts near 0. An arc that rewinds says less than none. */
  it("refuses to draw an arc that would rewind mid-extraction", () => {
    expect(ringFraction({ kind: "downloading", percent: 40, extracting: true })).toBeNull();
  });

  it("leaves the arc to the states with nothing in flight", () => {
    expect(ringFraction({ kind: "install" })).toBeNull();
    expect(ringFraction({ kind: "paused", percent: 55 })).toBeNull();
    expect(ringFraction({ kind: "error", message: null })).toBeNull();
    expect(ringFraction({ kind: "ready" })).toBeNull();
  });
});

describe("canStartInstall", () => {
  const install: EngineGroupState = { kind: "install" };

  it("blocks a second download while another engine holds the slot", () => {
    // The manager's runtime is single-slot: two transfers fight over one
    // controller, so the second card must wait.
    expect(canStartInstall(install, true)).toBe(false);
    expect(canStartInstall(install, false)).toBe(true);
  });

  it("never installs over a transfer in flight on this card", () => {
    const running: EngineGroupState = {
      kind: "downloading",
      percent: 10,
      extracting: false,
    };
    expect(canStartInstall(running, false)).toBe(false);
  });
});

/** Narrow guard: the card reads `status.state` from the store. */
describe("status contract", () => {
  it("accepts the paused state the bridge reports", () => {
    const status: TtsModelStatus = { state: "paused", percent: 20 };
    expect(engineGroupState(status)).toEqual({ kind: "paused", percent: 20 });
  });
});