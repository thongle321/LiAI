import Speech, { TTSEngine, type VoiceProps } from "@pocketpalai/react-native-speech";

import { ttsRuntime } from "../runtime.ts";
import { createEngineStreamingHandle } from "../streamingHandle.ts";
import type { Engine, StreamingHandle, Voice } from "../types.ts";

/** OS voices, mapped onto our generic `Voice` shape. */
export async function getSystemVoices(): Promise<Voice[]> {
  const voices = await Speech.getAvailableVoices();
  return voices.map((v: VoiceProps) => ({
    id: v.identifier,
    name: v.name ?? v.identifier,
    engine: "system",
    language: v.language,
  }));
}

/** The System engine speaks one fixed English voice (see store/voice.ts). */
const isEnglish = (v: Voice) => (v.language ?? "").toLowerCase().startsWith("en");

/**
 * First English device voice, cached. Falls back to any voice, then to a
 * synthetic entry so a device with an empty OS catalogue still has a
 * selectable/ speakable System voice (the OS falls back to its own default).
 */
export async function resolveSystemDefaultVoice(): Promise<Voice> {
  if (cached) return cached;
  const all = await getSystemVoices();
  cached = all.find(isEnglish) ?? all[0] ?? FALLBACK;
  return cached;
}

const FALLBACK: Voice = {
  id: "default",
  name: "System default",
  engine: "system",
  language: "en-US",
};

let cached: Voice | null = null;

/** Test-only: drop the cached default so each case re-resolves. */
export function _resetSystemVoiceCache(): void {
  cached = null;
}

/**
 * OS native TTS via `@pocketpalai/react-native-speech`.
 *
 * Always available — needs no downloaded pack.
 *
 * Completion note: the OS engine's `speak()` resolves on *dispatch*, not
 * when audio ends, so `play()` waits on the `onFinish` / `onStopped`
 * emitters to know when playback actually finished.
 */
export class SystemEngine implements Engine {
  readonly id = "system" as const;

  isInstalled(): Promise<boolean> {
    return Promise.resolve(true);
  }

  getVoices(): Promise<Voice[]> {
    return getSystemVoices();
  }

  /** The fork still needs an explicit OS_NATIVE initialize when switching
   *  back from a neural engine, else playback stays on the neural path. */
  async loadInto(): Promise<void> {
    await Speech.initialize({ engine: TTSEngine.OS_NATIVE });
  }

  async play(text: string, voice: Voice): Promise<void> {
    await ttsRuntime.acquire(this, () => this.speakToCompletion(text, voice));
  }

  /**
   * The OS queues utterances natively, so streaming degrades to roughly
   * per-sentence dispatch — equivalent in practice, and we inherit the
   * library's CJK sentence handling for free.
   */
  playStreaming(voice: Voice, waitFor?: Promise<void>): StreamingHandle {
    return createEngineStreamingHandle(this, voice.id, undefined, waitFor);
  }

  async stop(): Promise<void> {
    await Speech.stop();
  }

  private speakToCompletion(text: string, voice: Voice): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let done = false;
      const finish = (err?: unknown) => {
        if (done) return;
        done = true;
        subs.forEach((s) => s.remove());
        if (err) reject(err instanceof Error ? err : new Error(String(err)));
        else resolve();
      };
      // ponytail: `Speech.onX` returns an EventSubscription, not a function.
      const subs = [
        Speech.onFinish(() => finish()),
        Speech.onStopped(() => finish()),
        Speech.onError(() => finish(new Error("system tts failed"))),
      ];
      Speech.speak(text, voice.id).catch(finish);
    });
  }
}