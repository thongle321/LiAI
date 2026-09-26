/** Chat bubble: user card, assistant card (markdown + tool chips + actions),
 * and the tap-to-retry error card.
 *
 * Moved from components/Bubble.tsx (Wave 1 chat): assistant text renders
 * through MarkdownView; streaming replies re-parse per token chunk.
 */

import { Image as RNImage, Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { CheckCheck, Wrench } from "lucide-react-native";

import { APP_NAME } from "../../constants/app.ts";
import { images } from "../../constants/images.ts";

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
        <View className="rounded-xl rounded-br-sm bg-surface-3 px-5 py-3">
          <Text className="font-sans text-body-md text-primary-text">
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
    <Animated.View entering={entering} className="my-1 max-w-[75%] flex-row self-start">
      {/* Portrait avatar, not a glyph: LiAI's identity is a character, so
          a robot icon would replace the brand with a category. */}
      <RNImage
        source={images.icon}
        className="mr-2 mt-1 h-8 w-8 rounded-full"
        accessibilityLabel={`${APP_NAME} avatar`}
      />
      <View className="flex-1">
        <View className="mb-1 flex-row items-center gap-2">
          <Text className="font-sans text-caption text-secondary-text">{APP_NAME}</Text>
          <Text className="font-sans text-caption text-secondary-text">
            {formatTime(message.at)}
          </Text>
        </View>
        <View className="rounded-xl rounded-tl-sm border border-border bg-surface-1 px-5 py-3">
          <MarkdownView text={message.text} />
          {settled && <LinkPreviewCard text={message.text} />}
          {message.steps !== undefined && message.steps.length > 0 && (
            <View className="mt-2 flex-row flex-wrap items-center gap-2">
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
          {settled && message.usage ? `${message.usage.totalTokens} tokens` : ""}
        </Text>
        {onRegenerate !== null && settled && (
          <MessageActions
            text={message.text}
            usage={message.usage}
            onRegenerate={onRegenerate}
          />
        )}
      </View>
    </Animated.View>
  );
}
