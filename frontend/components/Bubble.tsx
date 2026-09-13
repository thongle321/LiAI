import { Pressable, Text, View } from "react-native";

import type { ChatMessage } from "../store/chat.ts";

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
  const mine = message.role === "user";
  return (
    <View
      className={`my-1 max-w-[80%] rounded-card px-4 py-2 ${
        mine ? "self-end bg-primary" : "self-start bg-surface-2"
      }`}
    >
      <Text
        className={`font-sans text-body-md ${mine ? "text-on-primary" : "text-primary-text"}`}
      >
        {message.text}
      </Text>
    </View>
  );
}
