/** The pre-entry memory sheet: whether chat + whisper (+ a voice, one
 *  day) can be resident together.
 *
 *  Ported from pocketpal-ai src/components/VoiceMemorySheet as LiAI's
 *  English copy on the shared Sheet. Divergences, recorded in the research
 *  note: no tts row (LiAI has no MEASURED engine RAM — a 0 row is not
 *  part of the breakdown), and "Choose a smaller model" routes to LiAI's
 *  Models screen via the caller. Continue only when the fit is not
 *  wont_fit: wont-fit has no Enter, smaller-model or Close are the ways
 *  out. The bar segments render proportionally against the larger of
 *  needed/available.
 */

import { Pressable, Text, View } from "react-native";

import { useColors } from "@/themes/tokens.ts";
import { formatBytes } from "@/services/models/progress.ts";
import { Sheet } from "@/components/sheet.tsx";
import { ASR_TIER_LABEL } from "@/utils/asr-tier-label.ts";
import type { VoiceMemoryFit, MemoryRowKind } from "@/services/voice/memory-fit.ts";

/** Row swatches. One hue, two steps is the bar's pair — chat rides the
 *  signal, speech recognition the success colour; both are theme-backed. */
const ROW_COLORS: Record<MemoryRowKind, "primary" | "success"> = {
  chat: "primary",
  stt: "success",
  tts: "success",
};

export function VoiceMemorySheet({
  fit,
  chatModelName,
  onClose,
  onContinue,
  onChooseSmallerModel,
}: {
  fit: VoiceMemoryFit;
  chatModelName: string;
  onClose: () => void;
  onContinue: () => void;
  onChooseSmallerModel: () => void;
}) {
  const colors = useColors();
  const wontFit = fit.status === "wont_fit";
  const breakdown = fit.breakdown;
  const total = Math.max(breakdown.availableBytes, breakdown.neededBytes, 1);
  const rows = breakdown.rows.map((row) => ({
    ...row,
    colorKey: ROW_COLORS[row.kind],
  }));

  return (
    <Sheet
      visible
      title={wontFit ? "Not enough memory" : "Memory is tight"}
      onClose={onClose}
      scrollable={false}
      testID="voice-memory-sheet"
    >
      <View className="gap-3">
        <Text className="font-sans text-body-md text-secondary-text">
          {wontFit
            ? "Speech recognition won't fit next to this chat model. Choose a smaller model to use voice mode."
            : "Voice mode keeps the chat model and speech recognition loaded at once. On this phone that may be slow, or the app may close."}
        </Text>

        {/* The breakdown bar: one segment per resident, proportional to the
            larger of needed/available so a tight fit reads as overflow. */}
        <View
          testID="voice-memory-bar"
          className="h-3.5 w-full flex-row overflow-hidden rounded-full bg-surface-2"
        >
          {rows.map((row) => (
            <View
              key={row.kind}
              style={{
                width: `${(row.bytes / total) * 100}%`,
                backgroundColor: colors[row.colorKey],
              }}
            />
          ))}
        </View>

        <View className="gap-2">
          {rows.map((row) => (
            <View
              key={row.kind}
              testID={`voice-memory-${row.kind}`}
              className="flex-row items-center justify-between gap-3"
            >
              <View className="flex-row flex-shrink items-center gap-2">
                <View
                  className="h-2.5 w-2.5 rounded"
                  style={{ backgroundColor: colors[row.colorKey] }}
                />
                <Text className="font-sans text-body-md text-primary-text">
                  {row.kind === "chat"
                    ? `Chat model · ${chatModelName}`
                    : `Speech recognition · Whisper ${ASR_TIER_LABEL[fit.sttTier]}`}
                </Text>
              </View>
              <Text className="font-sans text-body-md text-primary-text">
                {formatBytes(row.bytes, 1)}
              </Text>
            </View>
          ))}
          <View
            testID="voice-memory-needed"
            className="flex-row items-center justify-between gap-3 border-t border-border pt-2"
          >
            <Text className="font-sans-semibold text-body-md text-primary-text">
              Needed
            </Text>
            <Text className="font-sans-semibold text-body-md text-primary-text">
              {`${formatBytes(breakdown.neededBytes, 1)} of ${formatBytes(breakdown.availableBytes, 1)} available`}
            </Text>
          </View>
        </View>

        {!wontFit && (
          <Pressable
            onPress={onContinue}
            accessibilityRole="button"
            accessibilityLabel="Continue anyway"
            className="btn btn--primary active:opacity-80"
            testID="voice-memory-continue"
          >
            <Text className="text-action">
              Continue anyway
            </Text>
          </Pressable>
        )}
        <Pressable
          onPress={onChooseSmallerModel}
          accessibilityRole="button"
          accessibilityLabel="Choose a smaller model"
          className={`btn active:opacity-80 ${wontFit ? "btn--primary" : "btn--ghost"}`}
          testID="voice-memory-smaller-model"
        >
          <Text
            className={wontFit ? "text-action" : "text-body"}
          >
            Choose a smaller model
          </Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

