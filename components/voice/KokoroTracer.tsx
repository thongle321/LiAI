/** __DEV__-only kokoro tracer (issue 02).
 *
 * Exercises the download bridge and the one-shot speak path on a real
 * device: fetch the English kokoro model through sherpa's download manager
 * with visible percent, then speak a canned sentence through the native
 * PCM player. Ticket 03 replaces this with the real store + UI; release
 * builds drop it via the `__DEV__` gate at the call site.
 */

import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import {
  ttsDownloads,
  type TtsModelStatus,
} from "../../lib/tts/download.ts";
import {
  KOKORO_CANNED_LINE,
  KOKORO_EN_MODEL_ID,
  speakKokoroOnce,
} from "../../lib/tts/oneshot.ts";

function statusLine(status: TtsModelStatus | null): string {
  if (!status) return "Checking the model on disk…";
  switch (status.state) {
    case "not_installed":
      return "Not downloaded yet.";
    case "downloading":
      return `Downloading… ${Math.round(status.percent)}%`;
    case "ready":
      return "Downloaded. Tap Speak to hear it.";
    case "error":
      return `Download failed: ${status.error ?? "unknown error"}`;
  }
}

export function KokoroTracer() {
  const [status, setStatus] = useState<TtsModelStatus | null>(null);
  const [modelPath, setModelPath] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    ttsDownloads
      .status(KOKORO_EN_MODEL_ID)
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch((error: unknown) => {
        if (!cancelled) setNote(String(error));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const downloading = status?.state === "downloading";
  const ready = status?.state === "ready";

  function startDownload(): void {
    setNote(null);
    void ttsDownloads
      .download(KOKORO_EN_MODEL_ID, setStatus)
      .then((path) => {
        setModelPath(path);
        setNote("Download complete.");
      })
      .catch((error: unknown) => {
        // The state machine already carries the reason; this only covers
        // a rejection the bridge did not report.
        setNote(String(error));
      });
  }

  function startSpeak(): void {
    setNote(null);
    setSpeaking(true);
    const path = modelPath ?? null;
    const resolvePath = path
      ? Promise.resolve(path)
      : ttsDownloads.localPath(KOKORO_EN_MODEL_ID);
    void resolvePath
      .then((local) => {
        if (!local) throw new Error("Model not on disk any more.");
        setModelPath(local);
        return speakKokoroOnce({ modelPath: local, text: KOKORO_CANNED_LINE });
      })
      .then(() => setNote("Spoke the canned line."))
      .catch((error: unknown) => setNote(String(error)))
      .finally(() => setSpeaking(false));
  }

  return (
    <View className="voice-card mb-3">
      <View className="voice-card__header">
        <View className="flex-1">
          <Text className="voice-card__title">Kokoro tracer (dev)</Text>
          <Text className="voice-card__spec">
            {KOKORO_EN_MODEL_ID} · neural voice smoke test
          </Text>
        </View>
      </View>
      <View className="voice-card__body">
        <Text className="font-sans text-body-sm text-secondary-text">
          {statusLine(status)}
        </Text>
        {note !== null ? (
          <Text className="mt-2 font-sans text-body-sm text-primary-text">{note}</Text>
        ) : null}
        <View className="mt-3 flex-row gap-2">
          {!ready ? (
            <Pressable
              onPress={downloading ? undefined : startDownload}
              disabled={downloading}
              className="btn btn--ghost px-5 py-2"
              accessibilityRole="button"
              accessibilityLabel={downloading ? "Downloading kokoro model" : "Download kokoro model"}
            >
              <Text className="font-sans-semibold text-body-md text-primary">
                {downloading ? "Downloading…" : "Download"}
              </Text>
            </Pressable>
          ) : null}
          {downloading ? (
            <Pressable
              onPress={() => ttsDownloads.abort()}
              className="btn btn--ghost px-5 py-2"
              accessibilityRole="button"
              accessibilityLabel="Cancel download"
            >
              <Text className="font-sans-semibold text-body-md text-primary">Cancel</Text>
            </Pressable>
          ) : null}
          {ready ? (
            <Pressable
              onPress={speaking ? undefined : startSpeak}
              disabled={speaking}
              className="btn btn--ghost px-5 py-2"
              accessibilityRole="button"
              accessibilityLabel="Speak the canned line with kokoro"
            >
              <Text className="font-sans-semibold text-body-md text-primary">
                {speaking ? "Speaking…" : "Speak"}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}
