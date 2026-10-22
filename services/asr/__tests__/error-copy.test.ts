/** ASR error copy: the kind → words map, verbatim PocketPal copy, and
 *  which errors earn an Open Settings affordance. */

import {
  asrErrorCopy,
  hasOpenSettingsAction,
  insufficientStorageCopy,
  OPEN_SETTINGS_LABEL,
} from "@/services/asr/error-copy.ts";
import type { AsrErrorKind } from "@/services/asr/types.ts";

const KINDS: AsrErrorKind[] = [
  "permission_denied",
  "permission_blocked",
  "transcribe_failed",
  "not_installed",
  "insufficient_memory",
  "mic_unavailable",
  "transcript_partial",
];

describe("asrErrorCopy", () => {
  it("maps every kind to non-empty words (PocketParity en.json)", () => {
    for (const kind of KINDS) {
      expect(asrErrorCopy(kind).length).toBeGreaterThan(0);
    }
  });

  it("carries PocketPal's exact copy for the distinctive kinds", () => {
    expect(asrErrorCopy("permission_blocked")).toBe(
      "Microphone access is blocked. Enable it in Settings.",
    );
    expect(asrErrorCopy("insufficient_memory")).toBe(
      "Not enough memory for voice input with this chat model. Try a smaller model.",
    );
    expect(asrErrorCopy("mic_unavailable")).toBe(
      "The microphone isn't responding. Try again, or switch to a smaller chat model.",
    );
    expect(asrErrorCopy("transcript_partial")).toBe(
      "Part of your dictation couldn't be transcribed.",
    );
  });
});

describe("hasOpenSettingsAction (D8)", () => {
  it("only a BLOCKED permission routes to OS settings", () => {
    for (const kind of KINDS) {
      expect(hasOpenSettingsAction(kind)).toBe(kind === "permission_blocked");
    }
  });

  it("the action label is PocketPal's", () => {
    expect(OPEN_SETTINGS_LABEL).toBe("Open Settings");
  });
});

describe("insufficientStorageCopy", () => {
  it("words the preflight denial in whole MB", () => {
    expect(insufficientStorageCopy(264_464_607, 120_000_000)).toBe(
      "Not enough space — free up 264 MB to install this model (120 MB available).",
    );
  });

  it("an unreadable free figure reads as 0 available", () => {
    expect(insufficientStorageCopy(59_707_625, null)).toBe(
      "Not enough space — free up 59 MB to install this model (0 MB available).",
    );
  });
});
