import { useEffect, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Plus } from "lucide-react-native";

import { colors } from "../themes/tokens.ts";
import { APP_NAME } from "../constants/app.ts";

import { Bubble } from "../components/Bubble.tsx";
import { Connecting, Unavailable } from "../components/Unavailable.tsx";
import { InteractionPanel } from "../components/InteractionPanel.tsx";
import {
  useChatStore,
  type ChatMessage,
  type Connection,
} from "../store/chat.ts";

const CONNECTION_DOT_CLASS: Record<Connection, string> = {
  unknown: "status-dot status-dot--offline",
  up: "status-dot status-dot--online",
  down: "status-dot status-dot--error",
};

// Design's opening line, fixed once (visual only until the first exchange).
const GREETING: ChatMessage = {
  id: "greeting",
  role: "assistant",
  text: "Hey there.\nWhat would you like to do today?",
  at: Date.now(),
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

  useEffect(() => {
    void loadSession().then(() => checkHealth());
  }, [loadSession, checkHealth]);

  const dot = CONNECTION_DOT_CLASS[connection];
  // Design's opening line, visual only until the first real exchange.
  const visibleMessages: ChatMessage[] =
    messages.length === 0 ? [GREETING] : messages;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0B0C0C" }}>
      <View className="flex-row items-center border-b border-border bg-base px-4 py-3">
        <View className={dot} />
        <Text className="flex-1 text-center font-sans-semibold text-h3 text-primary">
          {APP_NAME}
        </Text>
        <Pressable onPress={() => void newConversation()} className="flex-row items-center px-2 py-1">
          <Plus size={18} color={colors.primary} />
          <Text className="ml-1 font-sans text-body-md text-primary">New</Text>
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
            data={visibleMessages}
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => (
              <Bubble message={item} onRetry={() => void retry(item.id)} />
            )}
            contentContainerClassName="p-4"
            className="flex-1"
          />
          {sending && (
            <Text className="px-4 pb-1 font-sans text-body-sm text-secondary-text">LiAI…</Text>
          )}
          <InteractionPanel
            sending={sending}
            onSend={(text, image) => send(text, image)}
            onNewConversation={() => void newConversation()}
          />
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}
