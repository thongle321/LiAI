/** Composer control-row replacement while a voice capture records or
 *  transcribes (PocketParity VoiceRecordingBar): cancel ✕, a live
 *  input-level waveform with the elapsed timer (or the transcribing
 *  label, which says when it waits for the chat reply), and stop ■ —
 *  with the spoken language, tappable to reset to auto-detect, below.
 *  Bar heights are runtime values, so the bars keep inline styles; the
 *  rest is Uniwind. */

import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { X } from "lucide-react-native";

import { useColors } from "@/themes/tokens.ts";
import { useAsrStore } from "@/store/asr.ts";
import {
  ASR_LEVEL_HISTORY,
  ASR_MAX_RECORD_MS,
  ASR_RECORD_WARNING_MS,
} from "@/services/asr/constants.ts";

const BAR_MAX_HEIGHT = 24;

/** Height ladder the level bars ride; exported for the suite. */
export const BAR_MIN_HEIGHT = 3;
export const BAR_RANGE = BAR_MAX_HEIGHT - BAR_MIN_HEIGHT;

/** m:ss, zero-padded on the seconds. */
function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function LevelBars() {
  const colors = useColors();
  const levels = useAsrStore((s) => s.inputLevels);
  // Bars run right-aligned: the newest level sits at the timer's edge.
  const padding = ASR_LEVEL_HISTORY - levels.length;
  return (
    <View
      className="min-h-0 flex-1 flex-row items-center justify-end gap-[3px] overflow-hidden"
      style={{ height: BAR_MAX_HEIGHT }}
      accessible
      accessibilityLabel="Recording"
      testID="voice-level-bars"
    >
      {Array.from({ length: ASR_LEVEL_HISTORY }, (_, i) => {
        const level = i < padding ? 0 : (levels[i - padding] ?? 0);
        return (
          <View
            key={i}
            className="rounded-full bg-secondary-text"
            style={{
              width: 3,
              height: BAR_MIN_HEIGHT + level * BAR_RANGE,
            }}
          />
        );
      })}
    </View>
  );
}

function ElapsedTimer() {
  const colors = useColors();
  const startedAt = useAsrStore((s) => s.recordingStartedAt);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    // PocketParity cadence: the timer reads are UI, not measurements.
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, []);
  if (startedAt === null) return null;
  const elapsed = Math.max(0, now - startedAt);
  const nearCap = ASR_MAX_RECORD_MS - elapsed <= ASR_RECORD_WARNING_MS;
  return (
    <Text
      className="min-w-9 text-right font-sans text-body-sm tabular-nums"
      style={{ color: nearCap ? colors.error : colors.secondaryText }}
      testID="voice-elapsed"
    >
      {formatElapsed(elapsed)}
    </Text>
  );
}

function LanguageLabel() {
  const colors = useColors();
  const code = useAsrStore((s) => s.spokenLanguage);
  const setSpokenLanguage = useAsrStore((s) => s.setSpokenLanguage);
  if (code === null) {
    return (
      <Text
        className="pb-1.5 text-center text-quiet"
        testID="voice-language"
      >
        Language: auto
      </Text>
    );
  }
  return (
    <Pressable
      onPress={() => setSpokenLanguage(null)}
      accessibilityRole="button"
      hitSlop={8}
      testID="voice-language-reset"
    >
      <Text
        className="pb-1.5 text-center text-quiet"
        testID="voice-language"
      >
        Language: {code.toUpperCase()} (tap to reset)
      </Text>
    </Pressable>
  );
}

export function VoiceRecordingBar({
  onCancel,
  onStop,
}: {
  onCancel: () => void;
  onStop: () => void;
}) {
  const colors = useColors();
  const captureState = useAsrStore((s) => s.captureState);
  const waitingForChat = useAsrStore((s) => s.waitingForChat);
  const isTranscribing = captureState === "transcribing";
  return (
    <View testID="voice-recording-bar">
      <View className="flex-row items-center gap-3 px-4 py-2.5">
        <Pressable
          onPress={onCancel}
          className="h-9 w-9 items-center justify-center rounded-full bg-surface-3"
          accessibilityRole="button"
          accessibilityLabel="Cancel voice input"
          testID="voice-cancel-button"
        >
          <X size={18} color={colors.primaryText} />
        </Pressable>
        {isTranscribing ? (
          <Text
            className="flex-1 text-center text-quiet"
            accessibilityLiveRegion="polite"
            testID="voice-transcribing"
          >
            {waitingForChat
              ? "Transcribing after the reply finishes…"
              : "Transcribing…"}
          </Text>
        ) : (
          <>
            <LevelBars />
            <ElapsedTimer />
          </>
        )}
        {isTranscribing ? (
          <View className="h-9 w-9 items-center justify-center rounded-full bg-surface-3">
            <ActivityIndicator size="small" color={colors.primaryText} />
          </View>
        ) : (
          <Pressable
            onPress={onStop}
            className="h-9 w-9 items-center justify-center rounded-full bg-surface-3"
            accessibilityRole="button"
            accessibilityLabel="Stop and transcribe"
            testID="voice-stop-button"
          >
            <View className="h-3 w-3 rounded-sm bg-primary-text" />
          </Pressable>
        )}
      </View>
      <LanguageLabel />
    </View>
  );
}
