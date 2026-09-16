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
import Animated from "react-native-reanimated";
import { Menu, Plus } from "lucide-react-native";

import { colors } from "../themes/tokens.ts";
import { CONNECTION_DOT_CLASS } from "../lib/connection.ts";
import { fadeEntering, fadeExiting, useMotionDuration } from "../lib/motion.ts";
import { APP_NAME } from "../constants/app.ts";

import { Bubble } from "../components/Bubble.tsx";
import { AppDrawer } from "../components/AppDrawer.tsx";
import { Connecting, Unavailable } from "../components/Unavailable.tsx";
import { InteractionPanel } from "../components/InteractionPanel.tsx";
import {
  useChatStore,
  type ChatMessage,
} from "../store/chat.ts";

// Design's opening line, fixed once (visual only until the first exchange).
const GREETING: ChatMessage = {
  id: "greeting",
  role: "assistant",
  text: "Hey there.\nWhat would you like to do today?",
  at: Date.now(),
};

export default function ChatScreen() {
  const [drawerOpen, setDrawerOpen] = useState(false);
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
  const motionDuration = useMotionDuration();
  // Design's opening line, visual only until the first real exchange.
  const visibleMessages: ChatMessage[] =
    messages.length === 0 ? [GREETING] : messages;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0B0C0C" }}>
      <View className="flex-row items-center border-b border-border bg-base px-4 py-3">
        <View className="w-16 flex-row items-center">
          <Pressable onPress={() => setDrawerOpen(true)} className="px-1 py-1">
            <Menu size={22} color={colors.primary} />
          </Pressable>
          <View className={`${dot} ml-2`} />
        </View>
        <Text className="flex-1 text-center font-sans-semibold text-h3 text-primary">
          {APP_NAME}
        </Text>
        <Pressable onPress={() => void newConversation()} className="w-16 flex-row items-center justify-end px-2 py-1">
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
            <Animated.Text
              entering={fadeEntering(motionDuration)}
              exiting={fadeExiting(motionDuration)}
              className="px-4 pb-1 font-sans text-body-sm text-secondary-text"
            >
              LiAI…
            </Animated.Text>
          )}
          <InteractionPanel
            sending={sending}
            onSend={(text, image) => send(text, image)}
          />
        </KeyboardAvoidingView>
      )}
      <AppDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </SafeAreaView>
  );
}
