/** Chat screen: message list, typing indicator, composer.
 *
 * Moved from app/(drawer)/(tabs)/chat.tsx (Wave 1 chat): the route is now
 * thin, this owns the screen. Messages stream token-by-token into the
 * pending bubble; completed assistant bubbles offer copy + regenerate.
 */

import { useEffect, useState } from "react";
import {
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRouter } from "expo-router";
import Animated from "react-native-reanimated";
// The library's KAV, not React Native's: with KeyboardProvider mounted,
// React Native's own KAV double-pads on Android (kirillzyusko#584). This is
// the app's single keyboard-avoidance mechanism.
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Check, Menu, Search, Share, X } from "lucide-react-native";

import { colors } from "../../themes/tokens.ts";
import { filterMessages } from "../../lib/chat/filter.ts";
import { buildTranscript } from "../../lib/chat/transcript.ts";
import { useCopy } from "../../hooks/useCopy.ts";
import {
  fadeEntering,
  fadeExiting,
  useMotionDuration,
  usePressFeedback,
  useTabContentFade,
} from "../../lib/motion.ts";
import { APP_NAME } from "../../constants/app.ts";
import { useChatStore } from "../../store/chat.ts";
import { useModelStore } from "../../store/modelStore";
import { useModelReady } from "../../hooks/useModelReady.ts";
import { Bubble } from "./Bubble.tsx";
import { ChatEmptyPlaceholder } from "./ChatEmptyPlaceholder.tsx";
import { ChatInput } from "./ChatInput.tsx";
import { UsageStats } from "./UsageStats.tsx";
import { SuggestedPrompts } from "./SuggestedPrompts.tsx";
import { MessageList } from "./MessageList.tsx";

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

  // Activation happens on the Models screen while chat stays mounted:
  // re-resolve readiness so the bar and prompts vanish on their own.
  const activeModelId = useModelStore((s) => s.activeModelId);
  useEffect(() => {
    void checkHealth();
  }, [activeModelId, checkHealth]);

  // PocketPal parity: the composer is always visible. With no model the
  // send button disables, the placeholder names it, and the bar below
  // routes to Models — it dismisses itself the moment one loads.
  const ready = connection === "up";
  // The engine-accurate gate for the composer's mic/attach and the centered
  // warning below, so they can never light up for a model the engine would
  // reject. The empty-conversation placeholder is NOT gated on this: it owns
  // the whole screen when the thread is empty (it has its own centered copy
  // and button), so the warning line is shown only when there ARE messages
  // — otherwise both would render at once, with two "load a model" buttons.
  const modelReady = useModelReady();
  // The centered empty placeholder ("Activate Model To Get Started" / "No
  // Models Available") owns the whole message area when there is no model
  // and no conversation. Without this, the always-rendered empty MessageList
  // (also flex-1) would split the column, squeezing the placeholder into the
  // bottom half so its button overlapped the composer — the bug seen after
  // load → unload. With the list hidden, the placeholder centers cleanly.
  const emptyState = messages.length === 0 && query.trim() === "";
  const showPlaceholder = !ready && emptyState;

  const motionDuration = useMotionDuration();
  const contentFade = useTabContentFade();
  const navigation = useNavigation<{ openDrawer: () => void }>();
  const router = useRouter();
  const menuPress = usePressFeedback();
  const searchPress = usePressFeedback();
  const copyPress = usePressFeedback();
  const searchBarEntering = fadeEntering(motionDuration);
  const searchBarExiting = fadeExiting(motionDuration);

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{ flex: 1, backgroundColor: colors.base }}
    >
      {/* 56px header on Clean White with a 1px Hairline bottom. Both slots
          are w-24 (96px): the trailing group is two 48px targets, so equal
          slots must be sized to the WIDER group or its overflow eats the
          wordmark's flex space and shifts it off-centre. */}
      <View className="h-14 flex-row items-center border-b border-border bg-surface-1 px-5">
        <View className="w-24 flex-row items-center">
          <Animated.View style={menuPress.animatedStyle}>
            <Pressable
              onPress={() => navigation.openDrawer()}
              onPressIn={menuPress.onPressIn}
              onPressOut={menuPress.onPressOut}
              className="h-12 w-12 items-center justify-center"
              accessibilityRole="button"
              accessibilityLabel="Open menu"
              hitSlop={4}
            >
              <Menu size={20} color={colors.primaryText} />
            </Pressable>
          </Animated.View>
        </View>
        <Pressable
          onPress={() => router.push("/models")}
          className="flex-1"
          accessibilityRole="button"
          accessibilityLabel="Open models"
        >
          <Text
            numberOfLines={1}
            className="text-center font-sans-semibold text-h2 text-primary-text"
          >
            {APP_NAME}
          </Text>
        </Pressable>
        <View className="w-24 flex-row items-center justify-end">
          <Animated.View style={searchPress.animatedStyle}>
            <Pressable
              onPress={() => {
                setSearchOpen((o) => !o);
                setQuery("");
              }}
              onPressIn={searchPress.onPressIn}
              onPressOut={searchPress.onPressOut}
              className="h-12 w-12 items-center justify-center"
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel={searchOpen ? "Close search" : "Search this conversation"}
            >
              {searchOpen ? (
                <X size={20} color={colors.primary} />
              ) : (
                <Search size={20} color={colors.secondaryText} />
              )}
            </Pressable>
          </Animated.View>
          <Animated.View style={copyPress.animatedStyle}>
            <Pressable
              onPress={() => {
                const title = sessions.find((s) => s.id === sessionId)?.title;
                copy(buildTranscript(messages, title));
              }}
              onPressIn={copyPress.onPressIn}
              onPressOut={copyPress.onPressOut}
              className="h-12 w-12 items-center justify-center"
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel={copied ? "Copied" : "Copy transcript"}
            >
              {copied ? (
                <Check size={20} color={colors.success} />
              ) : (
                <Share size={20} color={colors.secondaryText} />
              )}
            </Pressable>
          </Animated.View>
        </View>
      </View>
      {searchOpen && (
        <Animated.View
          entering={searchBarEntering}
          exiting={searchBarExiting}
          className="flex-row items-center gap-2 border-b border-border bg-base px-5 py-2"
        >
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
        </Animated.View>
      )}

      {/* Composer always mounted (PocketPal ChatView parity): the
          no-model bar auto-dismisses on activation, no Retry needed. */}
      {/* padding on BOTH platforms, deliberately. This used to be
          iOS-only, copied from React Native's KAV docs, where
          behavior=undefined on Android was safe because adjustResize
          shrank the window. It no longer does: the app is edge-to-edge
          (targetSdk 36), so on Android the window keeps its size, the app
          draws behind the keyboard, and behavior=undefined leaves the
          composer underneath it. react-native-keyboard-controller is
          exactly the library that makes padding correct on Android too. */}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        {/* Hide the (empty) list while the centered no-model placeholder owns
            the space, so the two flex-1 siblings never split the column. */}
        {!showPlaceholder && (
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
        )}
        {sending && (
          <Animated.Text
            entering={fadeEntering(motionDuration)}
            exiting={fadeExiting(motionDuration)}
            className="px-5 pb-1 font-sans text-body-sm text-secondary-text"
          >
            LiAI…
          </Animated.Text>
        )}
        {ready && emptyState && <SuggestedPrompts onPick={(prompt) => void send(prompt)} />}
        {showPlaceholder && <ChatEmptyPlaceholder />}
        <UsageStats messages={messages} />
        {!modelReady && messages.length > 0 && (
          // Centered above the composer so the no-model state is visible on
          // every chat screen WITH a conversation, not just the empty one.
          // The empty conversation is owned by ChatEmptyPlaceholder, so this
          // is suppressed there to keep one signal and one button.
          <View className="mb-1 items-center px-5">
            <Text className="text-center font-sans text-body-md text-secondary-text">
              Load a model to keep chatting
            </Text>
            <Pressable
              onPress={() => router.push("/models")}
              className="btn btn--primary mt-3"
              accessibilityRole="button"
              accessibilityLabel="Go to models"
            >
              <Text className="text-center font-sans-semibold text-body-md text-on-primary">
                Go to Models
              </Text>
            </Pressable>
          </View>
        )}
        <ChatInput
          sending={sending}
          ready={ready}
          onSend={(text, image) => send(text, image)}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
