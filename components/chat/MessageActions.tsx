/** Inline actions under a completed assistant bubble: copy + regenerate +
 * speak, plus the turn footer (G4).
 *
 * The footer used to be split across two places -- a `"{n} tokens"` line
 * in MessageListItem and a `"{p} in - {c} out"` line here -- which printed
 * the same figure twice. It lives here alone now.
 */

import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Check, Copy, RotateCcw, Volume2, VolumeX } from "lucide-react-native";

import { colors } from "../../themes/tokens.ts";
import { useCopy } from "../../hooks/useCopy.ts";
import { speakReply, stopSpeaking } from "../../lib/voiceSpeak.ts";
import type { MessageUsage, TurnOutcomeFlags } from "../../types/chat.ts";

export function MessageActions({
  text,
  usage,
  outcome,
  contextBannerVisible,
  onRegenerate,
}: {
  text: string;
  /** Token counts for the finished turn; hidden while streaming. */
  usage?: MessageUsage;
  /** How the turn ended. Absent when the engine reported nothing. */
  outcome?: TurnOutcomeFlags;
  /** True when the context-full banner is on screen for this
   * conversation. It then owns the message, so the footer must not also
   * say "Cut off": saying it twice is noise, not emphasis. */
  contextBannerVisible?: boolean;
  onRegenerate: () => void;
}) {
  const { copied, copy } = useCopy();
  // Per-message TTS over the system voice (settings UX owns voice/rate).
  const [speaking, setSpeaking] = useState(false);
  const speakingRef = useRef(false);
  speakingRef.current = speaking;

  function toggleSpeak(): void {
    if (speakingRef.current) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    const reset = () => setSpeaking(false);
    speakReply(text, { onDone: reset, onStopped: reset, onError: reset });
    setSpeaking(true);
  }

  useEffect(() => {
    return () => {
      // Session switch unmounts the list mid-speech: don't orphan audio.
      if (speakingRef.current) stopSpeaking();
    };
  }, []);

  return (
    // Column: the action row, then the footer line that explains how the
    // turn ended. The footer is OUT of the action row so it can hold a
    // sentence's worth of text without fighting three 48px targets.
    <View className="mt-2">
      <View className="flex-row items-center gap-3">
        <Pressable
          onPress={() => copy(text)}
          className="h-12 w-12 items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel={copied ? "Copied" : "Copy message"}
        >
          {copied ? (
            <Check size={16} color={colors.success} />
          ) : (
            <Copy size={16} color={colors.secondaryText} />
          )}
        </Pressable>
        <Pressable
          onPress={onRegenerate}
          className="h-12 w-12 items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="Regenerate message"
        >
          <RotateCcw size={16} color={colors.secondaryText} />
        </Pressable>
        <Pressable
          onPress={toggleSpeak}
          className="h-12 w-12 items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel={speaking ? "Stop speaking" : "Speak message"}
        >
          {speaking ? (
            <VolumeX size={16} color={colors.primary} />
          ) : (
            <Volume2 size={16} color={colors.secondaryText} />
          )}
        </Pressable>
        {usage !== undefined && (
          <Text className="ml-auto font-sans text-caption text-secondary-text">
            {usage.promptTokens} in · {usage.completionTokens} out
          </Text>
        )}
      </View>
      <TurnFooter
        usage={usage}
        outcome={outcome}
        contextBannerVisible={contextBannerVisible}
      />
    </View>
  );
}

/** The one line under the bubble that explains how the turn ended.
 *
 * "Interrupted" is the one that matters: before this, a reply the user
 * stopped mid-stream looked exactly like a finished one, because Stop
 * keeps the partial text and stamps a timestamp. */
function TurnFooter({
  usage,
  outcome,
  contextBannerVisible,
}: {
  usage?: MessageUsage;
  outcome?: TurnOutcomeFlags;
  contextBannerVisible?: boolean;
}) {
  if (usage === undefined && outcome === undefined) return null;

  const marker =
    outcome?.interrupted === true
      ? "Interrupted"
      : outcome?.contextFull === true && contextBannerVisible !== true
        ? "Cut off"
        : null;

  const t = outcome?.timings;
  // A zero rate is a measurement, not a missing one, so it is shown --
  // but an engine that reported no timings at all must not print "0".
  const parts: string[] = [];
  if (t !== undefined) {
    parts.push(`${t.promptMs} ms to first token`);
    if (t.tokensPerSecond > 0) parts.push(`${t.tokensPerSecond.toFixed(1)} tok/s`);
    if (t.msPerToken > 0) parts.push(`${t.msPerToken.toFixed(1)} ms/token`);
    // Prompt throughput: two decimals, because prompt rates run to the
    // hundreds and one decimal would read as the same number as the
    // generation rate beside it. Gated on present AND finite -- absent
    // is "the engine did not report it", not zero.
    if (t.promptTokensPerSecond !== undefined && Number.isFinite(t.promptTokensPerSecond)) {
      parts.push(`${t.promptTokensPerSecond.toFixed(2)} prompt tok/s`);
    }
  }

  return (
    <View className="mt-1 flex-row flex-wrap items-center gap-x-2 gap-y-0.5">
      {marker !== null && (
        <Text className="font-sans text-micro text-error">{marker}</Text>
      )}
      {parts.length > 0 && (
        <Text className="font-sans text-micro text-secondary-text">
          {parts.join(" · ")}
        </Text>
      )}
    </View>
  );
}
