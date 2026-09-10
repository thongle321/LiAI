/** In-call question composer: sends liai.question events, surfaces answers. */

import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useCall } from "@stream-io/video-react-native-sdk";

export function QuestionBar({
  onAnswer,
}: {
  onAnswer: (text: string) => void;
}) {
  const call = useCall();
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!call) return;
    const off = call.on("custom", (event) => {
      const custom = event.custom;
      if (custom.type === "liai.answer" && typeof custom.text === "string")
        onAnswer(custom.text);
    });
    return off;
  }, [call, onAnswer]);

  async function ask(): Promise<void> {
    const text = draft.trim();
    if (!call || text === "") return;
    setDraft("");
    await call.sendCustomEvent({ type: "liai.question", text });
  }

  return (
    <View className="flex-row items-center px-4 py-2 border-t border-gray-700">
      <TextInput
        value={draft}
        onChangeText={setDraft}
        placeholder="Ask about what you see…"
        placeholderTextColor="#9ca3af"
        className="flex-1 text-white"
      />
      <Pressable
        onPress={() => void ask()}
        disabled={draft.trim() === ""}
        className="px-2 py-1"
      >
        <Text className="text-blue-400">Ask</Text>
      </Pressable>
    </View>
  );
}
