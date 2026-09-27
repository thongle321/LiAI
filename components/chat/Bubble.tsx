/** Chat bubble: user card, assistant card (markdown + tool chips + actions),
 * and the tap-to-retry error card.
 *
 * Moved from components/Bubble.tsx (Wave 1 chat): assistant text renders
 * through MarkdownView; streaming replies re-parse per token chunk.
 */

import { ActivityIndicator, Image as RNImage, Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { CheckCheck, Wrench } from "lucide-react-native";

import { APP_NAME } from "../../constants/app.ts";

// Reanimated v4 ships View/Text/Image/ScrollView only — Pressable
// goes through the builtin factory instead of a hand-rolled wrapper.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

import { colors } from "../../themes/tokens.ts";
import { formatTime } from "../../lib/format.ts";
import {
  bubbleEntering,
  fadeExiting,
  useMotionDuration,
  usePressFeedback,
} from "../../lib/motion.ts";
import type { MessageRow } from "../../lib/chat/rows.ts";
import { AssistantAvatar } from "./AssistantAvatar.tsx";
import { MarkdownView } from "./MarkdownView.tsx";
import { MessageActions } from "./MessageActions.tsx";
import { LinkPreviewCard } from "./LinkPreview.tsx";

export function Bubble({
  row,
  onRetry,
  onRegenerate,
}: {
  /** One adapter row: message plus its group/avatar/status flags. */
  row: MessageRow;
  onRetry: () => void;
  /** Null for user bubbles (nothing to regenerate). */
  onRegenerate: (() => void) | null;
}) {
  const { message, grouped, showAvatar, status } = row;
  const duration = useMotionDuration();
  const entering = bubbleEntering(duration);
  const exiting = fadeExiting(duration);
  const press = usePressFeedback();
  // Previews and actions target settled turns: a half-streamed URL would
  // trigger a garbage preview fetch, and actions need final text.
  const settled = message.streaming !== true;
  if (message.error) {
    return (
      <AnimatedPressable
        entering={entering}
        exiting={exiting}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        onPress={onRetry}
        style={press.animatedStyle}
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
      <Animated.View entering={entering} exiting={exiting} className="my-1 max-w-[80%] self-end items-end">
        {message.image !== undefined && (
          <RNImage
            source={{ uri: message.image }}
            className="w-40 h-[120px] rounded-xl mb-1"
          />
        )}
        <View className={`px-5 py-3 ${grouped ? "rounded-xl" : "rounded-xl rounded-br-sm"} bg-surface-3`}>
          <Text className="font-sans text-body-md text-primary-text">
            {message.text}
          </Text>
        </View>
        <View className="w-full">
          <LinkPreviewCard text={message.text} />
        </View>
        {/* Time + status once per group, like the assistant name row:
            repeating them on every grouped turn is visual noise. */}
        {!grouped && (
          <View className="mt-1 flex-row items-center">
            <Text className="font-sans text-caption text-secondary-text">
              {formatTime(message.at)}
            </Text>
            {status === "sending" ? (
              <ActivityIndicator size="small" color={colors.secondaryText} />
            ) : (
              <CheckCheck size={12} color={colors.secondaryText} />
            )}
          </View>
        )}
      </Animated.View>
    );
  }
  return (
    <Animated.View entering={entering} exiting={exiting} className="my-1 max-w-[75%] flex-row self-start">
      <AssistantAvatar shown={showAvatar} />
      <View className="flex-1">
        {!grouped && (
          <View className="mb-1 flex-row items-center gap-2">
            <Text className="font-sans text-caption text-secondary-text">{APP_NAME}</Text>
            <Text className="font-sans text-caption text-secondary-text">
              {formatTime(message.at)}
            </Text>
          </View>
        )}
        <View className={`border border-border bg-surface-1 px-5 py-3 ${grouped ? "rounded-xl" : "rounded-xl rounded-tl-sm"}`}>
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
