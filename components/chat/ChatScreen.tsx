/** Chat screen: message list, typing indicator, composer.
 *
 * Moved from app/(drawer)/(tabs)/chat.tsx (Wave 1 chat): the route is now
 * thin, this owns the screen. Messages stream token-by-token into the
 * pending bubble; completed assistant bubbles offer copy + regenerate.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRouter } from "expo-router";
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
// No KeyboardAvoidingView on this screen: the library's own guide lists four
// ways it falls short on chat layouts and ships KeyboardChatScrollView for
// the list. MessageList renders that; the composer and everything floating
// above it share the one occlusion value derived below.
// KeyboardGestureArea is deliberately absent: the guide pairs it with
// keyboardDismissMode="interactive" so the ACCESSORY follows the drag, but it
// is not exported in 1.21.9 (docs are on main/1.22). Interactive dismissal
// itself still works via keyboardDismissMode on the scroll view; only the
// composer tracking the finger needs 1.22+.
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
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
import { keyboardOcclusion } from "../../lib/keyboard.ts";
import type { ChatMessage } from "../../types/chat.ts";
import { useChatStore } from "../../store/chat.ts";
import { useModelStore } from "../../store/modelStore";
import { useModelReady } from "../../hooks/useModelReady.ts";
import { Bubble } from "./Bubble.tsx";
import { ChatEmptyPlaceholder } from "./ChatEmptyPlaceholder.tsx";
import { ChatInput } from "./ChatInput.tsx";
import { UsageStats } from "./UsageStats.tsx";
import { SuggestedPrompts } from "./SuggestedPrompts.tsx";
import { MessageList } from "./MessageList.tsx";

/** BottomNav is pt-2 + min-h-12 + pb-1 (see components/BottomNav.tsx). */
const TAB_BAR_HEIGHT = 60;

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
  // The empty placeholder ("Activate Model To Get Started" / "No Models
  // Available") is the LIST's ListEmptyComponent, pocketpal-ai style
  // (ChatView.tsx:990): it is content, so the keyboard covers it like any
  // other content instead of the screen re-centring around it. It renders
  // only with no model and no conversation — the empty thread is otherwise
  // SuggestedPrompts' job.
  const emptyState = messages.length === 0 && query.trim() === "";
  const showPlaceholder = !ready && emptyState;

  const motionDuration = useMotionDuration();
  const contentFade = useTabContentFade();
  const navigation = useNavigation<{ openDrawer: () => void }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const [atEnd, setAtEnd] = useState(true);
  const [listHeight, setListHeight] = useState(0);
  // What the list must clear: the tab bar and the safe-area inset below it.
  const keyboardOffset = insets.bottom + TAB_BAR_HEIGHT;
  // Height of the whole floating composer container, banners included. NOT
  // a delta from a baseline, unlike the library's example: the container is
  // out of flow, so nothing else accounts for it and the newest message would
  // sit behind it. ONE measurement, three consumers: this padding, the empty
  // state's lift, and the jump-to-latest anchor.
  const extraContentPadding = useSharedValue(0);
  const [composerHeight, setComposerHeight] = useState(0);
  // Minimum bottom inset while a reply streams, so the sent message is
  // pushed up and the response has somewhere to appear.
  const blankSpace = useSharedValue(0);

  // ONE reconciled occlusion value for everything that floats above the
  // composer. lib/keyboard.ts explains the abs() and the inset subtraction;
  // the vision panel consumes the same function so the two screens cannot
  // drift apart.
  const keyboard = useReanimatedKeyboardAnimation();
  const occlusion = useDerivedValue(() =>
    keyboardOcclusion(keyboard.height.value, insets.bottom),
  );
  // ONE mechanism, one direction: the composer container is absolutely
  // positioned at the bottom of the column and TRANSLATES up by the occlusion
  // (pocketpal-ai ChatView.tsx:1130). Everything behind it — the list, the
  // empty state, the jump-to-latest overlay — carries no transform at all, so
  // the keyboard covers whatever it covers and nothing re-centres behind it.
  //
  // Do NOT reintroduce a padding branch here. c79acfd padded the container
  // while the empty state owned the screen, to stop its centred icon sliding
  // under the header. That fixed the icon and silently killed the composer
  // lift in exactly the empty-thread case, because padding shrinks the
  // content box but leaves the container in flow. Making the empty state
  // ListEmptyComponent (above) removed the reason for the split.
  //
  // NOTE: no insets.bottom here. The tab bar owns the bottom inset
  // (app/(drawer)/(tabs)/_layout.tsx applies paddingBottom: insets.bottom to
  // itself, and the screens use edges=[top,left,right] so it is counted once,
  // there). Adding it here too was the dead space under the composer. When
  // the keyboard is up the bar is hidden and occlusion already has
  // insets.bottom subtracted, so nothing is owed to it.
  const composerStackStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -occlusion.value }],
  }));

  const handleComposerHeight = useCallback(
    (event: LayoutChangeEvent) => {
      const height = event.nativeEvent.layout.height;
      setComposerHeight(height);
      extraContentPadding.value = withTiming(height, { duration: motionDuration });
    },
    [extraContentPadding, motionDuration],
  );

  // Derived from the message itself rather than toggled on send, so it
  // cannot get stuck if a turn is cancelled or the screen is left mid-reply.
  const streaming = messages[messages.length - 1]?.streaming === true;
  useEffect(() => {
    blankSpace.value = withTiming(streaming ? listHeight : 0, {
      duration: motionDuration,
    });
  }, [streaming, listHeight, blankSpace, motionDuration]);
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
      {/* The chat keyboard architecture (react-native-keyboard-controller).
          Two surfaces, and only two:
            - the content column (list + empty state + jump-to-latest), which
              never moves — the keyboard covers what it covers;
            - the composer container, absolutely positioned at the bottom and
              translated up by the single reconciled occlusion value.
          The list (KeyboardChatScrollView, see MessageList) owns content
          repositioning inside the first. PocketPal ChatView parity: their own
          comments call out the same failure — two parts handling the keyboard
          separately is what makes a screen read as "drifting" when the
          keyboard opens. The library's guide is also explicit that
          KeyboardAvoidingView is the wrong tool for chat, so there is no KAV
          on this screen. */}
      <View style={{ flex: 1 }}>
        <Animated.View
          style={contentFade}
          className="flex-1"
          onLayout={(e) => setListHeight(e.nativeEvent.layout.height)}
        >
          <MessageList
            listRef={listRef}
            messages={visible}
            offset={keyboardOffset}
            extraContentPadding={extraContentPadding}
            blankSpace={blankSpace}
            onEndVisibleChange={setAtEnd}
            emptyComponent={
              showPlaceholder ? (
                // Lift clear of the FLOATING composer so its button is never
                // behind it. From the measured height, not a hard-coded
                // margin (pocketpal's bottomComponentHeight + 100 is a magic
                // number — see docs/specs/2026-09-27-pocketpal-keyboard-ui-parity.md).
                <View
                  className="flexGrow-1"
                  style={{ paddingBottom: composerHeight }}
                >
                  <ChatEmptyPlaceholder />
                </View>
              ) : null
            }
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
        {/* Jump to latest: an overlay pinned to the content column's
            bottom-right, above the floating composer — pocketpal's FAB
            placement. It wears the same transform as the composer so it
            rises welded to it, and only appears when the reader has actually
            scrolled away from the end, which is the only time the list stopped
            following along. */}
        {!atEnd && messages.length > 0 && (
          <Animated.View
            style={[composerStackStyle, { bottom: composerHeight }]}
            className="absolute right-5"
            pointerEvents="box-none"
          >
            <Pressable
              onPress={() => listRef.current?.scrollToEnd({ animated: true })}
              className="btn btn--secondary min-h-12 px-4"
              accessibilityRole="button"
              accessibilityLabel="Jump to latest message"
            >
              <Text className="font-sans text-body-sm text-primary">
                Jump to latest
              </Text>
            </Pressable>
          </Animated.View>
        )}
      </View>

      {/* The composer container: absolutely positioned, so it is out of the
          column's flow and the content behind it needs no knowledge of it
          beyond the measured height in extraContentPadding. onLayout is HERE,
          on the whole container, not on the input — the banners above the
          input are inside it and the list must clear all of them. */}
      <Animated.View
        style={composerStackStyle}
        onLayout={handleComposerHeight}
        className="absolute inset-x-0 bottom-0"
      >
        {sending && (
          <Animated.Text
            entering={fadeEntering(motionDuration)}
            exiting={fadeExiting(motionDuration)}
            className="px-5 pb-1 font-sans text-body-sm text-secondary-text"
          >
            LiAI…
          </Animated.Text>
        )}
        {ready && emptyState && (
          <SuggestedPrompts onPick={(prompt) => void send(prompt)} />
        )}
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
      </Animated.View>
    </SafeAreaView>
  );
}
