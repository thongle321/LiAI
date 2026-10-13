/** Kokoro voice-group UI rules (ticket 04 / spec Q12, Q15a, Q16).
 *
 * node --test cannot import the screen, so the two rule sets that decide
 * what the Kokoro group renders live here as pure functions — the same
 * reason lib/voices.ts exists. The group component consumes these; the
 * tests drive them with plain-object fakes (no React, no native modules).
 */

import type { Voice } from "./types.ts";
import type { TtsModelStatus } from "./download.ts";

/** The Kokoro group's body, derived from the store's download triplet. */
export type KokoroGroupState =
  | { kind: "install" }
  | { kind: "downloading"; percent: number }
  | { kind: "error"; message: string | null }
  | { kind: "ready" };

export function kokoroGroupState(status: TtsModelStatus | null): KokoroGroupState {
  // An unknown status (node, or an unreadable disk) reads as not
  // installed — the honest affordance is the download button.
  if (!status || status.state === "not_installed") return { kind: "install" };
  switch (status.state) {
    case "downloading":
      return {
        kind: "downloading",
        // The bridge clamps at the source; the UI re-clamps because the
        // status is plain data that may cross a process boundary.
        percent: Math.min(100, Math.max(0, Math.round(status.percent))),
      };
    case "error":
      return { kind: "error", message: status.error ?? null };
    case "ready":
      return { kind: "ready" };
  }
}

/** What tapping a voice row does, decided before any state changes. */
export type VoiceTapOutcome =
  /** Select the voice (persisted) and play the canned preview through it. */
  | { kind: "select-and-preview" }
  /** The tapped voice is the one previewing — stop it. */
  | { kind: "stop-preview" }
  /** No row is tappable: model not ready, or the voice is not kokoro. */
  | { kind: "unavailable" };

/** Voice rows exist only while the model is installed, so the rule keeps
 *  the tap honest even for a stale render (spec Q16 — preview enabled only
 *  when downloaded). A tap on the previewing voice stops it; any other
 *  kokoro tap selects that voice and previews it. */
export function voiceTap(input: {
  tapped: Voice;
  currentVoice: Voice | null;
  previewingId: string | null;
  status: TtsModelStatus | null;
}): VoiceTapOutcome {
  if (kokoroGroupState(input.status).kind !== "ready") return { kind: "unavailable" };
  if (input.tapped.engine !== "kokoro") return { kind: "unavailable" };
  if (input.previewingId === input.tapped.id) return { kind: "stop-preview" };
  return { kind: "select-and-preview" };
}
