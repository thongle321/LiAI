// useVoiceCapture ported from pocketpal-ai, using expo-audio-stream for PCM capture.
import { useCallback, useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";

import { fromByteArray, toByteArray } from "base64-js";
import { useAudioRecorder, type AudioDataEvent } from "@siteed/audio-studio";

import { asrStore } from "@/store/asr.ts";
import {
  ASR_LEVEL_CHUNKS,
  ASR_MAX_RECORD_MS,
  ASR_NO_AUDIO_MS,
  ASR_PROMPT_CHARS,
  ASR_SAMPLE_RATE,
  SpeechSegmenter,
  energyVad,
  inputLevel,
  int16PcmToFloat32,
  whisperAsrEngine,
} from "@/services/asr/index.ts";
import { ensureMicAccess } from "@/services/voice/mic-access.ts";

interface UseVoiceCaptureOptions {
  onTranscript: (text: string) => void;
}

interface UseVoiceCaptureReturn {
  start: () => void;
  stop: () => void;
  cancel: () => void;
}

export function useVoiceCapture(
  options: UseVoiceCaptureOptions,
): UseVoiceCaptureReturn {
  const { onTranscript } = options;

  const recordingRef = useRef(false);
  const sessionRef = useRef(0);
  const segmenterRef = useRef<SpeechSegmenter | null>(null);
  const engineQueueRef = useRef<Promise<void>>(Promise.resolve());
  const textsRef = useRef<string[]>([]);
  const failedRef = useRef(false);
  const chunkCountRef = useRef(0);
  const peakLevelRef = useRef(0);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noAudioTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasSpokenRef = useRef(false);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const recorder = useAudioRecorder();

  const enqueueEngine = useCallback((work: () => Promise<void>) => {
    engineQueueRef.current = engineQueueRef.current.then(work).catch((err) => {
      console.warn("[useVoiceCapture] engine work failed:", err);
    });
  }, []);

  const releaseEngine = useCallback(() => {
    enqueueEngine(() => whisperAsrEngine.release());
  }, [enqueueEngine]);

  const transcribeSegment = useCallback(
    (pcm: Uint8Array, session: number) => {
      enqueueEngine(async () => {
        if (session !== sessionRef.current) return;
        if (!energyVad(int16PcmToFloat32(pcm)).passed) return;
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
          if (session !== sessionRef.current) return;
        }
        const prompt = textsRef.current.join(" ").slice(-ASR_PROMPT_CHARS);
        const fixedLanguage = asrStore.spokenLanguage;
        try {
          const { text, language } = await whisperAsrEngine.transcribe(
            fromByteArray(pcm),
            {
              tier: asrStore.selectedTier,
              language: fixedLanguage ?? undefined,
              prompt: prompt || undefined,
            },
          );
          if (session === sessionRef.current && text.length > 0) {
            textsRef.current.push(text);
            if (!fixedLanguage && !asrStore.spokenLanguage && language) {
              asrStore.setSpokenLanguage(language);
            }
          }
        } catch (err) {
          if (session === sessionRef.current) {
            console.warn("[useVoiceCapture] transcribe failed:", err);
            failedRef.current = true;
          }
        }
      });
    },
    [enqueueEngine],
  );

  const teardownCapture = useCallback(() => {
    recordingRef.current = false;
    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
    if (noAudioTimerRef.current) {
      clearTimeout(noAudioTimerRef.current);
      noAudioTimerRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    // stopRecording() is async and rejects when nothing is recording; the
    // try/catch above cannot catch that, so swallow it here.
    void recorder.stopRecording().catch(() => {
      // nothing live
    });
  }, []);

  const finish = useCallback(
    async (session: number) => {
      if (!recordingRef.current || session !== sessionRef.current) return;
      teardownCapture();
      const tail = segmenterRef.current?.flush();
      segmenterRef.current = null;
      if (tail) transcribeSegment(tail, session);

      asrStore.setCaptureState("transcribing");
      await engineQueueRef.current;
      if (session !== sessionRef.current) return;
      releaseEngine();
      const text = textsRef.current.join(" ");
      if (failedRef.current && text.length === 0) {
        asrStore.setError("transcribe_failed");
        return;
      }
      asrStore.resetCapture();
      if (text.length > 0) {
        onTranscriptRef.current(text);
      }
      if (failedRef.current) {
        asrStore.setError("transcript_partial");
      }
    },
    [releaseEngine, teardownCapture, transcribeSegment],
  );

  const start = useCallback(() => {
    if (!asrStore.asrAvailable) return;
    if (
      recordingRef.current ||
      (asrStore.captureState !== "idle" && asrStore.captureState !== "error")
    ) {
      return;
    }
    const session = ++sessionRef.current;
    asrStore.setCaptureState("requesting_perm");
    (async () => {
      const fits = await asrStore.hasMemoryForCapture();
      if (session !== sessionRef.current) return;
      if (!fits) {
        asrStore.setError("insufficient_memory");
        return;
      }
      const access = await ensureMicAccess();
      if (session !== sessionRef.current) return;
      if (access === "settings") {
        asrStore.setError("permission_blocked");
        return;
      }
      if (access !== "granted") {
        asrStore.setError("permission_denied");
        return;
      }
      try {
        await recorder.startRecording({
          sampleRate: ASR_SAMPLE_RATE,
          channels: 1,
          encoding: "pcm_16bit",
          interval: 100,
          onAudioStream: async (event: AudioDataEvent) => {
            if (!recordingRef.current) return;
            const bytes = toByteArray(event.data as string);
            segmenterRef.current?.push(bytes);
            const samples = int16PcmToFloat32(bytes);
            const lvl = inputLevel(samples);
            peakLevelRef.current = Math.max(peakLevelRef.current, lvl);
            if (++chunkCountRef.current % ASR_LEVEL_CHUNKS === 0) {
              asrStore.pushInputLevel(peakLevelRef.current);
              peakLevelRef.current = 0;
            }
            // Auto-stop on silence: once speech has been heard, a sustained
            // pause (no voiced chunk) finalises the capture like ChatGPT.
            const voiced = energyVad(samples).passed;
            if (voiced) {
              hasSpokenRef.current = true;
              if (silenceTimerRef.current) {
                clearTimeout(silenceTimerRef.current);
                silenceTimerRef.current = null;
              }
              silenceTimerRef.current = setTimeout(() => {
                if (recordingRef.current && session === sessionRef.current) {
                  void finish(session).catch(() => {});
                }
              }, 1500);
            }
          },
        });
      } catch (err) {
        console.warn("[useVoiceCapture] audio init failed:", err);
        if (session === sessionRef.current) asrStore.setError("transcribe_failed");
        return;
      }
      if (session !== sessionRef.current) return;
      textsRef.current = [];
      failedRef.current = false;
      segmenterRef.current = new SpeechSegmenter((pcm) =>
        transcribeSegment(pcm, session),
      );
      recordingRef.current = true;
      chunkCountRef.current = 0;
      peakLevelRef.current = 0;
      asrStore.setCaptureState("recording");
      maxTimerRef.current = setTimeout(() => {
        finish(session).catch(() => {});
      }, ASR_MAX_RECORD_MS);
      noAudioTimerRef.current = setTimeout(() => {
        noAudioTimerRef.current = null;
        if (chunkCountRef.current === 0 && session === sessionRef.current) {
          teardownCapture();
          segmenterRef.current = null;
          asrStore.setError("mic_unavailable");
        }
      }, ASR_NO_AUDIO_MS);
    })();
  }, [finish, teardownCapture, transcribeSegment]);

  const stop = useCallback(() => {
    finish(sessionRef.current).catch(() => {});
  }, [finish]);

  const cancel = useCallback(() => {
    sessionRef.current++;
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (recordingRef.current) teardownCapture();
    segmenterRef.current = null;
    whisperAsrEngine.cancelTranscription().catch((err) => {
      console.warn("[useVoiceCapture] cancel transcription failed:", err);
    });
    releaseEngine();
    asrStore.resetCapture();
  }, [releaseEngine, teardownCapture]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next === "background" && recordingRef.current) stop();
    });
    return () => {
      sub.remove();
      if (recordingRef.current) cancel();
    };
  }, [cancel, stop]);

  return { start, stop, cancel };
}
