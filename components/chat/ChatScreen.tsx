/** Chat screen: message list, typing indicator, composer.
 *
 * Moved from app/(drawer)/(tabs)/chat.tsx (Wave 1 chat): the route is now
 * thin, this owns the screen. Messages stream token-by-token into the
 * pending bubble; completed assistant bubbles offer copy + regenerate.
 */

import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRouter } from "expo-router";
import Animated from "react-native-reanimated";
import { Check, Menu, Search, Share, X } from "lucide-react-native";

import { colors } from "../../themes/tokens.ts";
import { filterMessages } from "../../lib/chat/filter.ts";
import { buildTranscript } from "../../lib/chat/transcript.ts";
import { useCopy } from "../../hooks/useCopy.ts";
import { fadeEntering, fadeExiting, useMotionDuration, useTabContentFade } from "../../lib/motion.ts";
import { APP_NAME } from "../../constants/app.ts";
import { useChatStore } from "../../store/chat.ts";
import { useModelStore } from "../../store/modelStore";
import { Bubble } from "./Bubble.tsx";
import { ChatInput } from "./ChatInput.tsx";
import { UsageStats } from "./UsageStats.tsx";
import { SuggestedPrompts } from "./SuggestedPrompts.tsx";
import { MessageList } from "./MessageList.tsx";
import { Connecting, Unavailable } from "../Unavailable.tsx";

export function ChatScreen() {
  const messages = useChatStore((s) => s.messages);
  const sessionId = useChatStore((s) => s.sessionId);
  const sessions = useChatStore((s) => s.sessions);
  const connection = useChatStore((s) => s.connection);
  const sending = useChatStore((s) => s.sending);
  const loadSession = useChatStore((s) => s.loadSession);
  const checkHealth = useChatStore((s) => s.checkHealth);
  const send = useChatStore((s) => s.send);
  const retry = useChatStore((s) => s.retry);
  const regenerate = useChatStore((s) => s.regenerate);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { copied, copy } = useCopy();

  const visible = searchOpen ? filterMessages(messages, query) : messages;
  const matchLabel =
    searchOpen && query.trim() !== ""
      ? `${visible.length} of ${messages.length}`
      : null;

  useEffect(() => {
    void loadSession().then(() => checkHealth());
  }, [loadSession, checkHealth]);

  const motionDuration = useMotionDuration();
  const contentFade = useTabContentFade();
  const navigation = useNavigation<{ openDrawer: () => void }>();
  const router = useRouter();
  // Header shows the loaded model (PocketPal header-title parity);
  // tapping it opens Models to switch. Falls back to the app name.
  const headerTitle =
    useModelStore((s) => {
      const local = s.models.find((m) => m.id === s.activeModelId);
      if (local) return s.modelSettings[local.id]?.displayName || local.name;
      return s.remoteApis.find((p) => p.id === s.activeModelId)?.name ?? APP_NAME;
    });

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
        </View>
        <Pressable onPress={() => router.push("/models")} className="flex-1">
          <Text
            numberOfLines={1}
            className="text-center font-sans-semibold text-h3 text-primary"
          >
            {headerTitle}
          </Text>
        </Pressable>
        <View className="w-16 flex-row items-center justify-end">
          <Pressable
            onPress={() => {
              setSearchOpen((o) => !o);
              setQuery("");
            }}
            className="px-1.5 py-1"
          >
            {searchOpen ? (
              <X size={20} color={colors.primary} />
            ) : (
              <Search size={20} color={colors.secondaryText} />
            )}
          </Pressable>
          <Pressable
            onPress={() => {
              const title = sessions.find((s) => s.id === sessionId)?.title;
              copy(buildTranscript(messages, title));
            }}
            className="px-1.5 py-1"
          >
            {copied ? (
              <Check size={20} color={colors.success} />
            ) : (
              <Share size={20} color={colors.secondaryText} />
            )}
          </Pressable>
        </View>
      </View>
      {searchOpen && (
        <View className="flex-row items-center gap-2 border-b border-border bg-base px-4 py-2">
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search this conversation…"
            placeholderTextColor={colors.secondaryText}
            autoFocus
            className="flex-1 font-sans text-body-md text-primary-text"
          />
          {matchLabel !== null && (
            <Text className="font-sans text-caption text-secondary-text">
              {matchLabel}
            </Text>
          )}
        </View>
      )}

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
              messages={visible}
              renderBubble={(item) => (
                <Bubble
                  message={item}
                  onRetry={() => void retry(item.id)}
                  onRegenerate={
                    item.role === "assistant"
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
          {messages.length === 0 && query.trim() === "" && (
            <SuggestedPrompts onPick={(prompt) => void send(prompt)} />
          )}
          <UsageStats messages={messages} />
          <ChatInput
            sending={sending}
            onSend={(text, image) => send(text, image)}
          />
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}
