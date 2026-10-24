/** Whisper, then the chat model through the normal send path, then TTS.
 *
 *  Ported from pocketpal-ai src/services/voice/cascadeEngine.ts, mapped to
 *  LiAI's stores: `useAsrStore` (tier pinned at `prepare`, spoken language,
 *  the CPU-busy wait) and `useVoice` (playback idle = the reply finished
 *  speaking). Recorded divergences: the per-turn `speech_failed`
 *  bookkeeping the reference exposes through its TTS store does not exist
 *  here, and `speechStarted` is a playing/streaming playback state rather
 *  than a per-turn speech id.
 */

import { fromByteArray } from "base64-js";

import {
  energyVad,
  int16PcmToFloat32,
  whisperAsrEngine,
} from "@/services/asr/index.ts";
import type { AsrTier } from "@/services/asr/types.ts";
import { asrStore } from "@/store/asr.ts";
import { useVoice } from "@/store/voice.ts";

import type {
  VoiceEngine,
  VoiceTurn,
  VoiceTurnEvents,
  VoiceTurnOutcome,
  VoiceTurnPort,
} from "./types.ts";
import { whenPlaybackIdle } from "./playback-wait.ts";

/** Fires once the playback state claims audio is live; `stop` detaches. */
function watchSpeech(
  onSpeech: () => void,
): { stop(): void; stopped(): boolean } {
  let fired = false;
  const unsubscribe = useVoice.subscribe((state) => {
    const mode = state.playbackState.mode;
    if (mode === "playing" || mode === "streaming") {
      fired = true;
      onSpeech();
    }
  });
  return {
    stop: unsubscribe,
    stopped: () => fired,
  };
}

export class CascadeVoiceEngine implements VoiceEngine {
  readonly id = "cascade" as const;
  private tier: AsrTier | null = null;

  async prepare(tier: AsrTier): Promise<void> {
    this.tier = tier;
    await whisperAsrEngine.preload(tier);
  }

  async release(): Promise<void> {
    this.tier = null;
    await whisperAsrEngine.release();
  }

  runTurn(
    utterance: Uint8Array,
    port: VoiceTurnPort,
    on: VoiceTurnEvents,
  ): VoiceTurn {
    let aborted = false;
    let sending: Promise<void> | null = null;
    let interrupting: Promise<void> | null = null;
    let finished = false;

    const interrupt = (): Promise<void> => {
      if (finished) {
        return Promise.resolve();
      }
      interrupting ??= (async () => {
        aborted = true;
        if (!sending) {
          // Transcription is the only in-flight work: cancel the decode.
          await whisperAsrEngine.cancelTranscription().catch((err) => {
            console.warn("[voiceMode] cancel transcription failed:", err);
          });
          return;
        }
        // A reply is running: stop the speech, then the run — the row keeps
        // whatever was generated (PocketParity's port.stop).
        const stopping = useVoice.getState().stop().catch(() => {});
        port.stop();
        await sending.catch(() => {});
        await stopping;
      })();
      return interrupting;
    };

    const run = async (): Promise<VoiceTurnOutcome> => {
      // SAFETY: the recorder hands int16 PCM, so the float view is exact.
      const vad = energyVad(int16PcmToFloat32(utterance));
      if (!vad.passed) {
        return "empty";
      }
      let text: string;
      try {
        if (!this.tier) {
          throw new Error("voice engine not prepared");
        }
        // While a CPU-bound chat decode runs, transcription waits — the
        // same courtesy the dictation queue shows (store owns the flag).
        if (asrStore.chatBusyOnCpu) {
          asrStore.setWaitingForChat(true);
          await new Promise<void>((resolve) => {
            const check = setInterval(() => {
              if (!asrStore.chatBusyOnCpu) {
                clearInterval(check);
                resolve();
              }
            }, 100);
          });
          asrStore.setWaitingForChat(false);
        }
        const transcript = await whisperAsrEngine.transcribe(
          fromByteArray(utterance),
          {
            tier: this.tier,
            language: asrStore.spokenLanguage ?? undefined,
          },
        );
        text = transcript.text.trim();
      } catch (err) {
        if (aborted) return "interrupted";
        console.warn("[voiceMode] transcribe failed:", err);
        return "transcribe_failed";
      }
      if (aborted) return "interrupted";
      if (!text) return "empty";
      on.transcribed(text);

      const speech = watchSpeech(on.speechStarted);
      sending = port
        .send(text, () => {})
        .then(
          () => {},
          (err) => {
            console.warn("[voiceMode] reply failed:", err);
            throw err;
          },
        );
      let sendFailed = false;
      try {
        await sending;
      } catch {
        sendFailed = true;
      }
      await whenPlaybackIdle();
      speech.stop();

      if (interrupting) {
        await interrupting;
        return "interrupted";
      }
      return sendFailed ? "reply_failed" : "answered";
    };

    const done = run().finally(() => {
      finished = true;
    });

    return { done, interrupt };
  }
}
