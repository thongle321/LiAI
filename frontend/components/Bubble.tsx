import { Image as RNImage, Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { Bot, CheckCheck, Image } from "lucide-react-native";

// Reanimated v4 ships View/Text/Image/ScrollView only — Pressable
// goes through the builtin factory instead of a hand-rolled wrapper.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

import { colors } from "../themes/tokens.ts";
import { formatTime } from "../lib/format.ts";
import { bubbleEntering, useMotionDuration } from "../lib/motion.ts";
import type { ChatMessage } from "../store/chat.ts";

export { formatTime };

export function Bubble({
  message,
  onRetry,
}: {
  message: ChatMessage;
  onRetry: () => void;
}) {
  const duration = useMotionDuration();
  const entering = bubbleEntering(duration);
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
            style={{ width: 160, height: 120, borderRadius: 12, marginBottom: 4 }}
          />
        )}
        <View className="rounded-card rounded-br-sm bg-primary px-4 py-2">
          <Text className="font-sans text-body-md text-on-primary">
            {message.text}
          </Text>
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
          <Text className="font-sans text-body-md text-primary-text">
            {message.text}
          </Text>
          {message.image !== undefined && (
            <View className="mt-2 aspect-video items-center justify-center rounded-card border border-border bg-surface-2">
              <Image size={40} color={colors.secondaryText} />
            </View>
          )}
        </View>
        <Text className="mt-1 font-sans text-caption text-secondary-text">
          {formatTime(message.at)}
        </Text>
      </View>
    </Animated.View>
  );
}
