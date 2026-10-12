/** TTS engine abstraction.
 *
 * Ported from pocketpal-ai `src/services/tts/types.ts` so the engine
 * contract is identical. Every engine is a thin wrapper over
 * `@pocketpalai/react-native-speech`; nothing outside lib/tts imports
 * that package directly.
 */

export type EngineId = "system" | "kitten" | "kokoro" | "supertonic";

/** Engines that need a downloaded model pack. System is always available. */
export type NeuralEngineId = Exclude<EngineId, "system">;

/**
 * Diffusion-step counts exposed for Supertonic. The fork supports
 * `1|2|3|4|5|10|20|50`; we expose `1|2|3|5|10|20` — 4 is perceptually too
 * close to 3/5 and 50 blows the interactive latency budget.
 */
export type SupertonicSteps = 1 | 2 | 3 | 5 | 10 | 20;

export interface Voice {
  /** Stable identifier used to look up the voice on the underlying engine. */
  id: string;
  /** Human-readable display name (e.g. "Sarah"). */
  name: string;
  /** Engine that owns this voice. */
  engine: EngineId;
  /** Optional language code (BCP-47 or engine-specific). */
  language?: string;
  /** Optional gender hint for UI grouping. */
  gender?: "f" | "m";
}

/**
 * A per-message streaming playback session. Tokens go in via `appendText`
 * as the LLM produces them; `finalize` when the response completes;
 * `cancel` on stop / chat switch / background.
 *
 * Implementations must be idempotent — after `finalize` or `cancel`,
 * further calls are no-ops.
 */
export interface StreamingHandle {
  appendText(chunk: string): void;
  finalize(): Promise<void>;
  cancel(): Promise<void>;
}

export interface Engine {
  readonly id: EngineId;
  /** Whether the engine can play right now (models installed, etc). */
  isInstalled(): Promise<boolean>;
  /** Voices this engine can currently speak. */
  getVoices(): Promise<Voice[]>;
  /** Initialize the native engine. Called by the runtime when this engine
   *  becomes active; idempotent at the runtime level. */
  loadInto(): Promise<void>;
  /** Replay path — speak `text` in one call. Resolves when playback ends. */
  play(text: string, voice: Voice): Promise<void>;
  /** Streaming path — feed tokens in as the LLM generates them.
   *  `waitFor` delays first synthesis (e.g. behind a prior stop()). */
  playStreaming(voice: Voice, waitFor?: Promise<void>): StreamingHandle;
  /** Stop any in-flight playback. Safe when idle. */
  stop(): Promise<void>;
}