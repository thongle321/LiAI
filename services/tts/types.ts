/** TTS engine layer types — PocketPal-shaped, on LiAI's stack.
 *
 *  Adds the streaming path (`playStreaming` + `StreamingHandle`) that the
 *  v1 oneshot-only layer lacked, plus the `NeuralEngine` download surface
 *  so the store drives installs through the engine instead of a sherpa
 *  bridge.
 */

import type { FirstChunkMode, StreamProgressEvent } from "@pocketpalai/react-native-speech";

export type EngineId = "system" | "kitten" | "kokoro" | "supertonic" | "phonon";

/** Engines whose model files the app downloads and manages. */
export type NeuralEngineId = Exclude<EngineId, "system">;

export type SupertonicSteps = 1 | 2 | 3 | 5 | 10 | 20;
export type SupertonicLanguage = string;

export type TtsModelState =
  | "not_installed"
  | "downloading"
  | "paused"
  | "ready"
  | "error";

export interface TtsModelStatus {
  state: TtsModelState;
  percent: number;
  phase?: string;
  error?: string;
}

export interface Voice {
  id: string;
  name: string;
  engine: EngineId;
  language?: string;
  gender?: "f" | "m";
}

export interface SpeakOptions {
  voice?: Voice;
}

export interface StreamingHandle {
  appendText(chunk: string): void;
  finalize(): Promise<void>;
  cancel(): Promise<void>;
}

export interface StreamOptions {
  firstChunk?: FirstChunkMode;
  onProgress?: (event: StreamProgressEvent) => void;
}

export interface Engine {
  readonly id: EngineId;
  isInstalled(): Promise<boolean>;
  getVoices(): Promise<Voice[]>;
  loadInto(): Promise<void>;
  play(text: string, voice: Voice): Promise<void>;
  playStreaming(voice: Voice, waitFor?: Promise<void>, streamOpts?: StreamOptions): StreamingHandle;
  stop(): Promise<void>;
}

export interface NeuralEngine extends Engine {
  readonly id: NeuralEngineId;
  downloadModel(onProgress?: (progress: number) => void): Promise<void>;
  deleteModel(): Promise<void>;
  reclaimLegacySpace?(): Promise<void>;
}

/** The one System row (Q9): OS TTS with no voice pinning. */
export const DEVICE_DEFAULT_VOICE: Voice = {
  id: "device-default",
  name: "Device default voice",
  engine: "system",
};