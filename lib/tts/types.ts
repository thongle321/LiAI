/** TTS engine layer types (ticket 03 / spec Q2, Q15a).
 *
 * PocketPal-shaped (`services/tts/types.ts`) with the v1 surface only:
 * id / isInstalled / getVoices / loadInto / play / stop. The streaming
 * path (`playStreaming` + StreamingHandle) is phase 2 (spec Q3).
 */

export type EngineId = "system" | "kokoro";

export interface Voice {
  /** Stable identifier used to look up the voice on the engine. */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** Engine that owns this voice. */
  engine: EngineId;
  /** Optional language code (BCP-47 or engine-specific). */
  language?: string;
}

/** Kokoro synthesis knobs; the system engine ignores both. */
export interface PlayOptions {
  /** Speaker id override; kokoro-en-v0_19 has 11 (0..10). */
  sid?: number;
  speed?: number;
}

export interface Engine {
  readonly id: EngineId;
  /** Whether the engine can play now (models installed, OS TTS present). */
  isInstalled(): Promise<boolean>;
  /** Voices this engine offers. */
  getVoices(): Promise<Voice[]>;
  /** Claim the single native slot. Called by the runtime, once per swap. */
  loadInto(): Promise<void>;
  /** Speak `text`; resolves when playback ends or is stopped. */
  play(text: string, voice: Voice, options?: PlayOptions): Promise<void>;
  /** Stop in-flight playback. Safe to call when idle. */
  stop(): Promise<void>;
}

/** The one System row (Q15a): OS TTS with no voice pinning (Q9 — system
 *  voices are never enumerated, so nothing carries an OS voice id). */
export const DEVICE_DEFAULT_VOICE: Voice = {
  id: "device-default",
  name: "Device default voice",
  engine: "system",
};
