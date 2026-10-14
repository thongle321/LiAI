/** Engine-card UI rules (spec Q12, Q15a, Q16).
 *
 * node --test cannot import the screen, so the rule sets that decide what
 * an engine card renders live here as pure functions — the same reason
 * lib/tts/voiceUi.ts exists. The component consumes these; the tests drive
 * them with plain-object fakes (no React, no native modules).
 *
 * Engine-agnostic since the engine list went from one to three: nothing
 * here knows that kokoro exists, only that a card has a download status and
 * a set of voices.
 */

import type { NeuralEngineId, Voice } from "./types.ts";
import { clampPercent, type TtsModelStatus } from "./download.ts";

/** An engine card's expanded body, derived from its download status. */
export type EngineGroupState =
  | { kind: "install" }
  | { kind: "downloading"; percent: number }
  | { kind: "error"; message: string | null }
  | { kind: "ready" };

export function engineGroupState(status: TtsModelStatus | null): EngineGroupState {
  // An unknown status (node, or an unreadable disk) reads as not
  // installed — the honest affordance is the download button.
  if (!status || status.state === "not_installed") return { kind: "install" };
  switch (status.state) {
    case "downloading":
      return {
        kind: "downloading",
        percent: clampPercent(Math.round(status.percent)),
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
  /** No row is tappable: model not ready, or the voice is not this card's. */
  | { kind: "unavailable" };

/** Voice rows exist only while the model is installed, so the rule keeps
 * the tap honest even for a stale render (spec Q16 — preview enabled only
 * when downloaded). A tap on the previewing voice stops it; any other tap
 * on THIS engine's rows selects that voice and previews it.
 *
 * `engine` is the card that was tapped, not the voice's own engine: with
 * three engines on screen a kitten row must never answer to kokoro's
 * install state, so a mismatch is unavailable rather than a silent no-op. */
export function voiceTap(input: {
  tapped: Voice;
  engine: NeuralEngineId;
  currentVoice: Voice | null;
  previewingId: string | null;
  status: TtsModelStatus | null;
}): VoiceTapOutcome {
  if (engineGroupState(input.status).kind !== "ready") return { kind: "unavailable" };
  if (input.tapped.engine !== input.engine) return { kind: "unavailable" };
  if (input.previewingId === input.tapped.id) return { kind: "stop-preview" };
  return { kind: "select-and-preview" };
}