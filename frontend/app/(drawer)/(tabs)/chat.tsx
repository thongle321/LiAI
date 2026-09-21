import { useEffect, useRef } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "expo-router";
import Animated from "react-native-reanimated";
import { Menu } from "lucide-react-native";

import { colors } from "../../../themes/tokens.ts";
import { CONNECTION_DOT_CLASS } from "../../../lib/connection.ts";
import { fadeEntering, fadeExiting, useMotionDuration, useTabContentFade } from "../../../lib/motion.ts";
import { APP_NAME } from "../../../constants/app.ts";

import { Bubble } from "../../../components/Bubble.tsx";
import { Connecting, Unavailable } from "../../../components/Unavailable.tsx";
import { InteractionPanel } from "../../../components/InteractionPanel.tsx";
import {
  useChatStore,
  type ChatMessage,
} from "../../../store/chat.ts";

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

  useEffect(() => {
    void loadSession().then(() => checkHealth());
  }, [loadSession, checkHealth]);

  const dot = CONNECTION_DOT_CLASS[connection];
  const motionDuration = useMotionDuration();
  const contentFade = useTabContentFade();
  // Design's opening line, visual only until the first real exchange.
  const visibleMessages: ChatMessage[] =
    messages.length === 0 ? [GREETING] : messages;
  // Follow the conversation: a new bubble lands below the fold, so
  // pin the list to the end on every new message (never on re-render
  // alone — length is the only trigger, reading history stays put).
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const navigation = useNavigation<{ openDrawer: () => void }>();
  useEffect(() => {
    listRef.current?.scrollToEnd({ animated: motionDuration > 0 });
  }, [visibleMessages.length, motionDuration]);

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{ flex: 1, backgroundColor: colors.base }}
    >
      <View className="flex-row items-center border-b border-border bg-base px-4 py-3">
        <View className="w-16 flex-row items-center">
          <Pressable onPress={() => navigation.openDrawer()} className="px-1 py-1">
            <Menu size={22} color={colors.primary} />
          </Pressable>
          <View className={`${dot} ml-2`} />
        </View>
        <Text className="flex-1 text-center font-sans-semibold text-h3 text-primary">
          {APP_NAME}
        </Text>
        <View className="w-16" />
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
          <Animated.View style={contentFade} className="flex-1">
            <FlatList
              ref={listRef}
              data={visibleMessages}
              keyExtractor={(m) => m.id}
              renderItem={({ item }) => (
                <Bubble message={item} onRetry={() => void retry(item.id)} />
              )}
              contentContainerClassName="p-4"
              className="flex-1"
            />
          </Animated.View>
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
    </SafeAreaView>
  );
}
