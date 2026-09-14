import { Pressable, Text, View } from "react-native";

import type { ChatMessage } from "../store/chat.ts";

/** HH:MM for the design's timestamp row under each bubble. */
export function formatTime(at: number): string {
  const d = new Date(at);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

export function Bubble({
  message,
  onRetry,
}: {
  message: ChatMessage;
  onRetry: () => void;
}) {
  if (message.error) {
    return (
      <Pressable
        onPress={onRetry}
        className="card card--error self-start max-w-[80%] my-1"
      >
        <Text className="font-sans text-body-md text-primary-text">
          {message.text}
        </Text>
        <Text className="mt-1 font-sans text-body-sm text-error">
          {message.error.message} — tap to retry
        </Text>
      </Pressable>
    );
  }
  if (message.role === "user") {
    return (
      <View className="my-1 max-w-[80%] self-end items-end">
        <View className="rounded-card rounded-br-sm bg-primary px-4 py-2">
          <Text className="font-sans text-body-md text-on-primary">
            {message.text}
          </Text>
        </View>
        <Text className="mt-1 font-sans text-caption text-secondary-text">
          {formatTime(message.at)} ✓✓
        </Text>
      </View>
    );
  }
  return (
    <View className="my-1 max-w-[85%] flex-row self-start">
      <View className="mr-2 mt-1 h-8 w-8 items-center justify-center rounded-full bg-surface-3">
        <Text className="font-sans-semibold text-body-md text-primary">✦</Text>
        <View className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border border-base bg-success" />
      </View>
      <View className="flex-1">
        <View className="rounded-card rounded-tl-sm border border-border bg-surface-1 px-4 py-2">
          <Text className="font-sans text-body-md text-primary-text">
            {message.text}
          </Text>
          {message.image !== undefined && (
            <View className="mt-2 aspect-video items-center justify-center rounded-card border border-border bg-surface-2">
              <Text className="text-h1 text-secondary-text">▦</Text>
            </View>
          )}
        </View>
        <Text className="mt-1 font-sans text-caption text-secondary-text">
          {formatTime(message.at)}
        </Text>
      </View>
    </View>
  );
}
