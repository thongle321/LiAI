/** Chat bubble: user card, assistant card (markdown + tool chips + actions),
 * and the tap-to-retry error card.
 *
 * Moved from components/Bubble.tsx (Wave 1 chat): assistant text renders
 * through MarkdownView; streaming replies re-parse per token chunk.
 */

import { Image as RNImage, Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { Bot, CheckCheck, Wrench } from "lucide-react-native";

// Reanimated v4 ships View/Text/Image/ScrollView only — Pressable
// goes through the builtin factory instead of a hand-rolled wrapper.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

import { colors } from "../../themes/tokens.ts";
import { formatTime } from "../../lib/format.ts";
import { bubbleEntering, useMotionDuration } from "../../lib/motion.ts";
import type { ChatMessage } from "../../types/chat.ts";
import { MarkdownView } from "./MarkdownView.tsx";
import { MessageActions } from "./MessageActions.tsx";
import { LinkPreviewCard } from "./LinkPreview.tsx";

export function Bubble({
  message,
  onRetry,
  onRegenerate,
}: {
  message: ChatMessage;
  onRetry: () => void;
  /** Null for user bubbles (nothing to regenerate). */
  onRegenerate: (() => void) | null;
}) {
  const duration = useMotionDuration();
  const entering = bubbleEntering(duration);
  // Previews and actions target settled turns: a half-streamed URL would
  // trigger a garbage preview fetch, and actions need final text.
  const settled = message.streaming !== true;
  if (message.error) {
    return (
      <AnimatedPressable
        entering={entering}
        onPress={onRetry}
        className="card card--error self-start max-w-[80%] my-1"
      >
        <Text className="font-sans text-body-md text-primary-text">
          {message.text}
        </Text>
        <Text className="mt-1 font-sans text-body-sm text-error">
          {message.error.message} — tap to retry
        </Text>
      </AnimatedPressable>
    );
  }
  if (message.role === "user") {
    return (
      <Animated.View entering={entering} className="my-1 max-w-[80%] self-end items-end">
        {message.image !== undefined && (
          <RNImage
            source={{ uri: message.image }}
            className="w-40 h-[120px] rounded-xl mb-1"
          />
        )}
        <View className="rounded-card rounded-br-sm bg-primary px-4 py-2">
          <Text className="font-sans text-body-md text-on-primary">
            {message.text}
          </Text>
        </View>
        <View className="w-full">
          <LinkPreviewCard text={message.text} />
        </View>
        <View className="mt-1 flex-row items-center">
          <Text className="font-sans text-caption text-secondary-text">
            {formatTime(message.at)}
          </Text>
          <CheckCheck size={12} color={colors.secondaryText} />
        </View>
      </Animated.View>
    );
  }
  return (
    <Animated.View entering={entering} className="my-1 max-w-[85%] flex-row self-start">
      <View className="mr-2 mt-1 h-8 w-8 items-center justify-center rounded-full bg-surface-3">
        <Bot size={16} color={colors.primary} />
        <View className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border border-base bg-success" />
      </View>
      <View className="flex-1">
        <View className="rounded-card rounded-tl-sm border border-border bg-surface-1 px-4 py-2">
          <MarkdownView text={message.text} />
          {settled && <LinkPreviewCard text={message.text} />}
          {message.steps !== undefined && message.steps.length > 0 && (
            <View className="mt-2 flex-row flex-wrap items-center gap-1.5">
              {message.steps.map((step, index) => (
                <View
                  key={step.id ?? `${step.tool}-${index}`}
                  className={`flex-row items-center gap-1 rounded-full border px-2 py-0.5 ${
                    step.status === "running"
                      ? "border-primary bg-surface-2"
                      : "border-border bg-surface-2"
                  }`}
                >
                  <Wrench
                    size={11}
                    color={
                      step.status === "running" ? colors.primary : colors.secondaryText
                    }
                  />
                  <Text
                    className={`font-sans text-caption ${
                      step.status === "running" ? "text-primary" : "text-secondary-text"
                    }`}
                  >
                    {step.tool}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
        <Text className="mt-1 font-sans text-caption text-secondary-text">
          {formatTime(message.at)}
        </Text>
        {onRegenerate !== null && settled && (
          <MessageActions text={message.text} onRegenerate={onRegenerate} />
        )}
      </View>
    </Animated.View>
  );
}
