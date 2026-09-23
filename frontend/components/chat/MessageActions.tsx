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
    <View className="mt-1 flex-row items-center gap-3">
      <Pressable
        onPress={() => copy(text)}
        className="flex-row items-center gap-1 py-1"
      >
        {copied ? (
          <Check size={13} color={colors.success} />
        ) : (
          <Copy size={13} color={colors.secondaryText} />
        )}
        <Text className="font-sans text-caption text-secondary-text">
          {copied ? "Copied" : "Copy"}
        </Text>
      </Pressable>
      <Pressable onPress={onRegenerate} className="flex-row items-center gap-1 py-1">
        <RotateCcw size={13} color={colors.secondaryText} />
        <Text className="font-sans text-caption text-secondary-text">Regenerate</Text>
      </Pressable>
      <Pressable onPress={toggleSpeak} className="flex-row items-center gap-1 py-1">
        {speaking ? (
          <VolumeX size={13} color={colors.primary} />
        ) : (
          <Volume2 size={13} color={colors.secondaryText} />
        )}
        <Text
          className={`font-sans text-caption ${
            speaking ? "text-primary" : "text-secondary-text"
          }`}
        >
          {speaking ? "Stop" : "Speak"}
        </Text>
      </Pressable>
      {usage !== undefined && (
        <Text className="font-sans text-caption text-secondary-text">
          {usage.promptTokens} in · {usage.completionTokens} out
        </Text>
      )}
    </View>
  );
}
