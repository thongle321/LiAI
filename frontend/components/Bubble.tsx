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
        className="self-start max-w-[80%] rounded-2xl bg-red-100 px-4 py-2 my-1"
      >
        <Text className="text-gray-900">{message.text}</Text>
        <Text className="text-red-700 mt-1">
          {message.error.message} — tap to retry
        </Text>
      </Pressable>
    );
  }
  const mine = message.role === "user";
  return (
    <View
      className={`max-w-[80%] rounded-2xl px-4 py-2 my-1 ${
        mine ? "self-end bg-blue-500" : "self-start bg-gray-200"
      }`}
    >
      <Text className={mine ? "text-white" : "text-gray-900"}>
        {message.text}
      </Text>
    </View>
  );
}
