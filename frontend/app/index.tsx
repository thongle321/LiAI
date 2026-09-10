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
import { router } from "expo-router";
import Constants from "expo-constants";

import { Bubble } from "../components/Bubble.tsx";
import { Connecting, Unavailable } from "../components/Unavailable.tsx";
import { useChatStore, type Connection } from "../store/chat.ts";

const CONNECTION_DOT_CLASS: Record<Connection, string> = {
  unknown: "bg-gray-400",
  up: "bg-green-500",
  down: "bg-red-500",
};

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

  useEffect(() => {
    void loadSession().then(() => checkHealth());
  }, [loadSession, checkHealth]);

  async function handleSend(): Promise<void> {
    const text = draft;
    if (await send(text)) setDraft("");
  }

  const dot = CONNECTION_DOT_CLASS[connection];
  const canSend = !sending && draft.trim() !== "";
  // ponytail: native WebRTC needs a dev-client build; Expo Go keeps text chat
  const showCamera = Constants.appOwnership !== "expo";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "white" }}>
      <View className="flex-row items-center px-4 py-3 border-b border-gray-200">
        <View className={`h-2.5 w-2.5 rounded-full ${dot}`} />
        <Text className="flex-1 text-center text-lg font-semibold text-gray-900">
          LiAI
        </Text>
        {showCamera && (
          <Pressable
            onPress={() => router.push("/call")}
            className="px-2 py-1"
          >
            <Text className="text-blue-500">Camera</Text>
          </Pressable>
        )}
        <Pressable onPress={() => void newConversation()} className="px-2 py-1">
          <Text className="text-blue-500">New</Text>
        </Pressable>
      </View>

      {connection === "unknown" ? (
        <Connecting />
      ) : connection === "down" ? (
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
              onSubmitEditing={() => void handleSend()}
              className="flex-1 rounded-full bg-gray-100 px-4 py-2 text-gray-900"
            />
            <Pressable
              disabled={!canSend}
              onPress={() => void handleSend()}
              className={`ml-2 rounded-full px-4 py-2 ${
                canSend ? "bg-blue-500" : "bg-gray-300"
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
