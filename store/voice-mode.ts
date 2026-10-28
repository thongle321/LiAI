/** One observable voice-mode session circuit (spec: hands-free in chat).
 *
 * The session controller (hooks/useVoiceMode) owns every behavior — entry
 * gates, capture, endpointing, turns, watchdog, exits — and is the ONLY
 * writer of this store. Consumers (the Voice tab; spec
 * 2026-10-27-voice-tab-hands-free-parity.md renders the `bar` presentation
 * inside the tab — chat-screen embedding is rejected) read it and call the
 * controller-bound actions, never set state. Presenter-affecting fields the
 * controller itself does not compute (mute toggle, full/bar presentation)
 * ride along so those tickets arrive as additive changes, not refactors.
 *
 * Pandit write lane: `voiceModeSessionApi` is the controller-fielded adapter
 * ({ get, set, reset }); the zustand hook below is the READ lane for
 * screens. Tests drive both directly — the store suite covers phase
 * transitions and reset-on-close semantics, and pins the write lane to the
 * controller module only (an architecture scan in the suite).
 */

import { create } from "zustand";

import type { VoiceModePhase } from "@/services/voice/voice-status.ts";
import type { VoiceMemoryFit } from "@/services/voice/memory-fit.ts";

/** The sheet state a session can hold while its phases stay "closed".
 *  Lived on the controller's React state; it is controller-emitted session
 *  state like anything else, so it lives here now. */
export type VoiceModeSheet =
  | { kind: "setup" }
  | { kind: "memory"; fit: VoiceMemoryFit }
  | null;

/** Which screen originated the live session. Blur-exit re-anchors to it:
 *  a session dies when ITS screen blurs, not when any screen does. */
export type VoiceSessionOrigin = "chat" | "voice";

/** How the session is presented over its origin screen. `full` is the
 *  current full-screen view; `bar` (later ticket) rides in the composer's
 *  place. Reset to `full` when the session closes. */
export type VoiceModePresentation = "full" | "bar";

export interface VoiceModeCircuit {
  phase: VoiceModePhase;
  /** Per-session mic mute (later ticket wires the UI). Reset on close. */
  micMuted: boolean;
  presentation: VoiceModePresentation;
  /** The screen requestEntry ran from; null whenever no request is away. */
  origin: VoiceSessionOrigin | null;
  /** The captions the controller used to merge into React state. */
  heard: string;
  reply: string | null;
  issue: string | null;
  needsMicSettings: boolean;
  sheet: VoiceModeSheet;
}

export function voiceModeDefaults(): VoiceModeCircuit {
  return {
    phase: "closed",
    micMuted: false,
    presentation: "full",
    origin: null,
    heard: "",
    reply: null,
    issue: null,
    needsMicSettings: false,
    sheet: null,
  };
}

/** The controller's write lane. Every mutation of the circuit happens
 *  through these three members; the hook below is read-only in practice. */
export interface VoiceModeSessionApi {
  get(): VoiceModeCircuit;
  /** Merge a patch — partial captions, a phase flip, a mute flag. */
  set(patch: Partial<VoiceModeCircuit>): void;
  /** Back to defaults: the suite's reset, and nothing else. */
  reset(): void;
}

/** The read lane. Screens subscribe; they do not setState on it — the
 *  "only the controller writes" rule is enforced by the store suite's
 *  import scan, not by runtime ceremony. */
export const useVoiceModeSession = create<VoiceModeCircuit>(
  () => voiceModeDefaults(),
);

export const voiceModeSessionApi: VoiceModeSessionApi = {
  get: () => useVoiceModeSession.getState(),
  set: (patch) => {
    // SAFETY: setState with a plain object merges shallowly in zustand —
    // exactly the captions-patch merge the controller relied on.
    useVoiceModeSession.setState(patch);
  },
  reset: () => {
    useVoiceModeSession.setState(voiceModeDefaults(), true);
  },
};
