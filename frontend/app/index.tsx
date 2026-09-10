import { useEffect, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useChatStore, type ChatMessage, type Connection } from "../store/chat";

const CONNECTION_DOT_CLASS: Record<Connection, string> = {
  unknown: "bg-gray-400",
  up: "bg-green-500",
  down: "bg-red-500",
};

function Bubble({ message, onRetry }: { message: ChatMessage; onRetry: () => void }) {
  if (message.error) {
    return (
      <Pressable
        onPress={onRetry}
        className="self-start max-w-[80%] rounded-2xl bg-red-100 px-4 py-2 my-1"
      >
        <Text className="text-red-700">
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

function Unavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <View className="flex-1 items-center justify-center px-8">
      <Text className="text-lg text-gray-900 text-center">
        Backend unreachable
      </Text>
      <Text className="text-sm text-gray-500 text-center mt-1">
        Start the backend, then retry.
      </Text>
      <Pressable
        onPress={onRetry}
        className="mt-4 rounded-full bg-blue-500 px-6 py-2"
      >
        <Text className="text-white font-semibold">Retry</Text>
      </Pressable>
    </View>
  );
}

export default function ChatScreen() {
  const messages = useChatStore((s) => s.messages);
  const connection = useChatStore((s) => s.connection);
  const sending = useChatStore((s) => s.sending);
  const loadSession = useChatStore((s) => s.loadSession);
  const checkHealth = useChatStore((s) => s.checkHealth);
  const send = useChatStore((s) => s.send);
  const retry = useChatStore((s) => s.retry);
  const newConversation = useChatStore((s) => s.newConversation);
  const [draft, setDraft] = useState("");

  function handleSend(): void {
    const text = draft;
    setDraft("");
    void send(text);
  }

  useEffect(() => {
    void loadSession().then(() => checkHealth());
  }, [loadSession, checkHealth]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "white" }}>
      <View className="flex-row items-center px-4 py-3 border-b border-gray-200">
        <View className={`h-2.5 w-2.5 rounded-full ${CONNECTION_DOT_CLASS[connection]}`} />
        <Text className="flex-1 text-center text-lg font-semibold text-gray-900">
          LiAI
        </Text>
        <Pressable onPress={() => void newConversation()} className="px-2 py-1">
          <Text className="text-blue-500">New</Text>
        </Pressable>
      </View>

      {connection !== "up" ? (
        <Unavailable onRetry={() => void checkHealth()} />
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <FlatList
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => (
              <Bubble message={item} onRetry={() => void retry(item.id)} />
            )}
            contentContainerClassName="p-4"
          />
          {sending && (
            <Text className="px-4 pb-1 text-sm text-gray-400">LiAI…</Text>
          )}
          <View className="flex-row items-center px-4 py-2 border-t border-gray-200">
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Message LiAI"
              multiline
              editable={!sending}
              onSubmitEditing={handleSend}
              className="flex-1 rounded-full bg-gray-100 px-4 py-2 text-gray-900"
            />
            <Pressable
              disabled={sending || draft.trim() === ""}
              onPress={handleSend}
              className={`ml-2 rounded-full px-4 py-2 ${
                sending || draft.trim() === "" ? "bg-gray-300" : "bg-blue-500"
              }`}
            >
              <Text className="text-white font-semibold">Send</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}
