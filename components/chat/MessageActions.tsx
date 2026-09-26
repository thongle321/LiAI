/** Inline actions under a completed assistant bubble: copy + regenerate + speak. */

import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Check, Copy, RotateCcw, Volume2, VolumeX } from "lucide-react-native";

import { colors } from "../../themes/tokens.ts";
import { useCopy } from "../../hooks/useCopy.ts";
import { speakReply, stopSpeaking } from "../../lib/voiceSpeak.ts";
import type { MessageUsage } from "../../types/chat.ts";

export function MessageActions({
  text,
  usage,
  onRegenerate,
}: {
  text: string;
  /** Token counts for the finished turn; hidden while streaming. */
  usage?: MessageUsage;
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
    // Action row: 16px 2px-stroke icons, no labels, Slate by default. Jade
    // check on copy, Signal Blue while speaking — a state, not a decoration.
    <View className="mt-2 flex-row items-center gap-3">
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
  );
}
