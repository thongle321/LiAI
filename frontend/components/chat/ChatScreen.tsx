/** Chat screen: message list, typing indicator, composer.
 *
 * Moved from app/(drawer)/(tabs)/chat.tsx (Wave 1 chat): the route is now
 * thin, this owns the screen. Messages stream token-by-token into the
 * pending bubble; completed assistant bubbles offer copy + regenerate.
 */

import { useEffect } from "react";
import {
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

import { colors } from "../../themes/tokens.ts";
import { CONNECTION_DOT_CLASS } from "../../lib/connection.ts";
import { fadeEntering, fadeExiting, useMotionDuration, useTabContentFade } from "../../lib/motion.ts";
import { APP_NAME } from "../../constants/app.ts";
import { useChatStore } from "../../store/chat.ts";
import { Bubble } from "./Bubble.tsx";
import { ChatInput } from "./ChatInput.tsx";
import { GREETING_ID, MessageList } from "./MessageList.tsx";
import { Connecting, Unavailable } from "../Unavailable.tsx";

export function ChatScreen() {
  const messages = useChatStore((s) => s.messages);
  const connection = useChatStore((s) => s.connection);
  const sending = useChatStore((s) => s.sending);
  const loadSession = useChatStore((s) => s.loadSession);
  const checkHealth = useChatStore((s) => s.checkHealth);
  const send = useChatStore((s) => s.send);
  const retry = useChatStore((s) => s.retry);
  const regenerate = useChatStore((s) => s.regenerate);

  useEffect(() => {
    void loadSession().then(() => checkHealth());
  }, [loadSession, checkHealth]);

  const dot = CONNECTION_DOT_CLASS[connection];
  const motionDuration = useMotionDuration();
  const contentFade = useTabContentFade();
  const navigation = useNavigation<{ openDrawer: () => void }>();

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
            <MessageList
              messages={messages}
              renderBubble={(item) => (
                <Bubble
                  message={item}
                  onRetry={() => void retry(item.id)}
                  onRegenerate={
                    item.role === "assistant" && item.id !== GREETING_ID
                      ? () => void regenerate(item.id)
                      : null
                  }
                />
              )}
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
          <ChatInput
            sending={sending}
            onSend={(text, image) => send(text, image)}
          />
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}
