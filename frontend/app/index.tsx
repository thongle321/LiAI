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

import { Bubble } from "../components/Bubble.tsx";
import { Connecting, Unavailable } from "../components/Unavailable.tsx";
import { useChatStore, type Connection } from "../store/chat.ts";

const CONNECTION_DOT_CLASS: Record<Connection, string> = {
  unknown: "status-dot status-dot--offline",
  up: "status-dot status-dot--online",
  down: "status-dot status-dot--error",
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0B0C0C" }}>
      <View className="flex-row items-center border-b border-border bg-base px-4 py-3">
        <View className={dot} />
        <Text className="flex-1 text-center font-sans-semibold text-h3 text-primary">
          LiAI
        </Text>
        <Pressable onPress={() => router.push("/vision")} className="px-2 py-1">
          <Text className="font-sans text-body-md text-primary">Vision</Text>
        </Pressable>
        <Pressable onPress={() => void newConversation()} className="px-2 py-1">
          <Text className="font-sans text-body-md text-primary">New</Text>
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
            <Text className="px-4 pb-1 font-sans text-body-sm text-secondary-text">LiAI…</Text>
          )}
          <View className="flex-row items-center border-t border-border bg-base px-4 py-2">
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Message LiAI"
              placeholderTextColor="#A1A1AA"
              multiline
              editable={!sending}
              onSubmitEditing={() => void handleSend()}
              className="input flex-1 font-sans"
            />
            <Pressable
              disabled={!canSend}
              onPress={() => void handleSend()}
              className={`btn ml-2 ${
                canSend ? "btn--primary" : "btn--secondary"
              }`}
            >
              <Text
                className={`font-sans-semibold ${
                  canSend ? "text-on-primary" : "text-secondary-text"
                }`}
              >
                Send
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}
