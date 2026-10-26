/** Voice-mode turn contracts (pocketpal-ai src/services/voice/types.ts).
 *
 *  A `VoiceEngine` turns one utterance into a spoken reply; LiAI's only
 *  implementation is the cascade: Whisper, then the chat model through the
 *  normal send path, then TTS. Readiness and memory checks live in the
 *  session controller (`hooks/useVoiceMode.ts`), not here.
 */

import type { AsrTier } from "@/services/asr/types.ts";

/** How one voice turn ended. Failures name the stage that failed. */
export type VoiceTurnOutcome =
  | "empty"
  | "answered"
  | "interrupted"
  | "transcribe_failed"
  | "reply_failed";

/** The chat the voice session talks to. */
export interface VoiceTurnPort {
  /**
   * Sends `text` as a spoken chat turn. `onTurnCreated` receives the
   * assistant turn's id once its row exists; the promise resolves when the
   * run settles, and REJECTS when the turn failed (the engine maps that to
   * `reply_failed` so this module stays decoupled from the chat store).
   */
  send(text: string, onTurnCreated: (turnId: string) => void): Promise<void>;
  /** Stops the running reply, as the Stop button does. */
  stop(): void;
}

export interface VoiceTurnEvents {
  transcribed(text: string): void;
  /** The reply started playing (phase follows the speech). */
  speechStarted(): void;
}

export interface VoiceTurn {
  done: Promise<VoiceTurnOutcome>;
  /** Stops the speech and the run; the row keeps what was generated. */
  interrupt(): Promise<void>;
}

/** One session engine. The cascade is the only implementation planned. */
export interface VoiceEngine {
  readonly id: "cascade";
  /** Makes the speech models resident for the session; turns use `tier`. */
  prepare(tier: AsrTier): Promise<void>;
  /** Frees them; resolves once any in-flight decode has stopped. */
  release(): Promise<void>;
  /** The reason the most recent turn failed to reply, if any. */
  lastReplyError?: string | null;
  runTurn(
    utterance: Uint8Array,
    port: VoiceTurnPort,
    on: VoiceTurnEvents,
  ): VoiceTurn;
}
