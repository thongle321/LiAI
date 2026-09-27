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
import Animated, { useSharedValue, withTiming } from "react-native-reanimated";
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
import type { ChatMessage } from "../../types/chat.ts";
import { useChatStore } from "../../store/chat.ts";
import { useModelStore } from "../../store/modelStore";
import { useKeyboardLift } from "../../hooks/useKeyboardLift.ts";
import { useModelReady } from "../../hooks/useModelReady.ts";
import { Bubble } from "./Bubble.tsx";
import { ChatEmptyPlaceholder } from "./ChatEmptyPlaceholder.tsx";
import { ChatInput } from "./ChatInput.tsx";
import { UsageStats } from "./UsageStats.tsx";
import { SuggestedPrompts } from "./SuggestedPrompts.tsx";
import { MessageList } from "./MessageList.tsx";

/** BottomNav is pt-2 + min-h-12 + pb-1 (see components/BottomNav.tsx). */
const TAB_BAR_HEIGHT = 60;

/** How long the "Load a model" chip survives a blur, so a touch that caused
 *  that blur can still resolve into a press. Comfortably longer than a tap. */
const CHIP_BLUR_GRACE_MS = 250;

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
  // re-resolve readiness so the prompt chips and the no-model affordance
  // appear and vanish on their own.
  const activeModelId = useModelStore((s) => s.activeModelId);
  useEffect(() => {
    void checkHealth();
  }, [activeModelId, checkHealth]);

  // PocketPal parity: the composer is always visible. With no model the send
  // button disables, the field's placeholder names it, and a tappable "Load a
  // model" chip appears on focus — it dismisses itself the moment one loads.
  const ready = connection === "up";
  // The engine-accurate gate, and the one the composer's affordances key off.
  // NOT the `ready` prop above: that is a transport health check refreshed by
  // checkHealth() and it can be stale, so it reports "up" while the engine has
  // no model source. In that divergence the placeholder would say "Type a
  // message…", the mic and attach would disable with labels promising to load a
  // model, and there would be no way to get there. `canSend` inside ChatInput
  // still uses the `ready` prop; that is pre-existing and out of this change's
  // scope, but the two must not be confused when editing either side.
  const modelReady = useModelReady();
  // The empty placeholder ("Activate Model To Get Started" / "No Models
  // Available") is NOT scroll content, despite pocketpal-ai putting it in
  // ListEmptyComponent (ChatView.tsx:990). KeyboardChatScrollView adds the
  // keyboard height to the scroll viewport as a contentInset, and a centred
  // child inside a shrinking box re-centres — which is exactly the "no models
  // available section moves when the keyboard shows up" symptom. So it is an
  // overlay beside the list, where the keyboard simply covers it. It renders
  // only with no model and no conversation; the empty thread with a model is
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
  const [composerFocused, setComposerFocused] = useState(false);
  // The chip's dismissal is DEFERRED, and that is not decoration. The chip
  // floats above the field, so touching it blurs the TextInput; a Pressable
  // that unmounts on blur never receives its press, and on Android the blur
  // lands on touch-down, before the press resolves - so /models would simply
  // never open. Wait a beat so the press can land, then dismiss.
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearChip = useCallback(() => {
    if (blurTimer.current) {
      clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }
    setComposerFocused(false);
  }, []);
  const handleComposerFocus = useCallback((focused: boolean) => {
    if (blurTimer.current) {
      clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }
    if (focused) {
      setComposerFocused(true);
      return;
    }
    blurTimer.current = setTimeout(clearChip, CHIP_BLUR_GRACE_MS);
  }, [clearChip]);
  useEffect(() => clearChip, [clearChip]);
  // A model activating is the other end of the chip's life, and that one is
  // immediate: there is no press to protect.
  useEffect(() => {
    if (modelReady) clearChip();
  }, [modelReady, clearChip]);
  const [listHeight, setListHeight] = useState(0);
  // What the list must clear: the tab bar and the safe-area inset below it.
  const keyboardOffset = insets.bottom + TAB_BAR_HEIGHT;
  // Height of the field, which IS the composer. NOT a delta from a baseline,
  // unlike the library's example: the field is out of flow, so nothing else
  // accounts for it and the newest message would sit behind it. The banners
  // above it are deliberately NOT in this number — they are overlays over the
  // list, and reserving for them would make the list reflow every time a chip
  // appeared. One measurement, three consumers: this padding, the empty
  // state's lift, and the jump-to-latest anchor.
  // and the jump-to-latest anchor.
  const extraContentPadding = useSharedValue(0);
  const [composerHeight, setComposerHeight] = useState(0);
  // Minimum bottom inset while a reply streams, so the sent message is
  // pushed up and the response has somewhere to appear.
  const blankSpace = useSharedValue(0);

  // The composer floats and lifts ITSELF — ChatInput calls useKeyboardLift, so
  // there is no wrapper box between this screen and the input. The only thing
  // left to lift here is the jump-to-latest overlay, and it uses the same hook
  // so the two rise welded together instead of tracking the keyboard
  // independently and drifting apart.
  //
  // No KeyboardAvoidingView on this screen: the library's own guide lists four
  // ways it falls short on chat layouts and ships KeyboardChatScrollView for
  // the list, which MessageList renders. KeyboardGestureArea is deliberately
  // absent too: the guide pairs it with keyboardDismissMode="interactive" so
  // the accessory follows the drag, but it is not exported in 1.21.9 (the docs
  // are on main/1.22). Interactive dismissal still works via keyboardDismissMode
  // on the scroll view; only the composer tracking the finger needs 1.22+.
  // The jump-to-latest pill and the composer overlays both ride the same
  // lift, so they rise welded to the field rather than tracking the keyboard
  // independently and drifting apart.
  const composerLift = useKeyboardLift();

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

      {/* Composer always mounted (PocketPal ChatView parity): the no-model
          affordance auto-dismisses on activation, no Retry needed. */}
      {/* The chat keyboard architecture (react-native-keyboard-controller).
          Three surfaces, and what each one does:
            - the content column (list + empty state): never moves. The
              keyboard covers what it covers, and nothing re-centres.
            - the composer: absolutely positioned at the bottom, lifting
              ITSELF via useKeyboardLift, and reporting its own height.
            - the jump-to-latest overlay: an absolute sibling above the
              composer, lifting on the same hook so the two stay welded.
          The list (KeyboardChatScrollView, see MessageList) owns content
          repositioning inside the column. There is deliberately no wrapper
          box around the composer: a wrapper that only re-exports a transform
          is a second box that can disagree with the one it wraps, which is
          how the empty state came to look like it was sinking while the
          composer sat still. PocketPal ChatView parity: their own comments
          call out the same failure — two parts handling the keyboard
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
        {/* The no-model empty state, as an overlay rather than scroll content.
            MessageList's header explains why: a ListEmptyComponent would sit
            inside the keyboard's contentInset and visibly re-centre as the
            keyboard rose. The bottom padding lifts it clear of the floating
            composer, from the measured height rather than pocketpal's
            hard-coded bottomComponentHeight + 100. */}
        {showPlaceholder && (
          <View
            className="absolute inset-0"
            style={{ paddingBottom: composerHeight }}
            pointerEvents="box-none"
          >
            <ChatEmptyPlaceholder />
          </View>
        )}
        {/* Jump to latest: an overlay pinned to the content column's
            bottom-right, above the floating composer — pocketpal's FAB
            placement. It lifts on the same hook as the composer so the two
            rise welded together, and only appears when the reader has
            actually scrolled away from the end, which is the only time the
            list stopped following along. */}
        {!atEnd && messages.length > 0 && (
          <Animated.View
            style={[composerLift, { bottom: composerHeight }]}
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

      {/* The composer. It IS the floating box: absolutely positioned, out of
          the column's flow, lifting itself, and reporting its own height.
          There is deliberately no wrapper between this screen and the input,
          because a wrapper that only re-exports a transform is a second box
          that can disagree with the one it wraps — which is exactly how the
          empty state came to look like it was sinking while the composer sat
          still, and how the earlier padding/translation split broke the lift. */}
      <ChatInput
        className="absolute inset-x-0 bottom-0"
        sending={sending}
        ready={ready}
        onSend={(text, image) => send(text, image)}
        onHeightChange={handleComposerHeight}
        onFocusChange={handleComposerFocus}
      />
      {/* Composer overlays: the chrome that is NOT part of the field and so
          cannot live inside it. Anchored directly above the field and lifted
          by the same hook, so the keyboard can never strand them; positioned
          over the list rather than in the field's flow, so they reserve
          nothing and the field never resizes when one appears.
          Each carries its own fill because it now sits over message content
          instead of over a bar. */}
      <Animated.View
        style={[composerLift, { bottom: composerHeight }]}
        className="absolute inset-x-0 px-4"
        pointerEvents="box-none"
      >
        {sending && (
          <Animated.Text
            entering={fadeEntering(motionDuration)}
            exiting={fadeExiting(motionDuration)}
            className="mb-1 self-start rounded-lg border border-border bg-surface-1 px-3 py-1 font-sans text-body-sm text-secondary-text"
          >
            LiAI…
          </Animated.Text>
        )}
        {ready && emptyState && (
          <SuggestedPrompts onPick={(prompt) => void send(prompt)} />
        )}
        <UsageStats messages={messages} />
        {/* The only in-composer route to the models screen, since the
            persistent "Go to Models" banner was removed. Left-anchored so it
            cannot collide with the jump-to-latest pill, which owns the
            bottom-right. Secondary, not Primary: Signal Blue marks one thing
            per screen and the send button already has it (DESIGN.md). */}
        {composerFocused && !modelReady && (
          <Pressable
            onPress={() => {
              clearChip();
              router.push("/models");
            }}
            // Neutral, NOT btn--secondary: that class is white on a Signal
            // Blue border (global.css), and the jump-to-latest pill is already
            // btn--secondary and can be on screen at the same time as this
            // chip — scrolled back through history, with no model, focused.
            // Two Signal Blue elements would break "Signal Blue marks exactly
            // one thing per screen" (DESIGN.md).
            className="mb-1 min-h-12 self-start items-center justify-center rounded-lg border border-border bg-surface-1 px-4"
            accessibilityRole="button"
            accessibilityLabel="Load a model"
          >
            <Text className="font-sans-semibold text-body-sm text-primary-text">
              Load a model
            </Text>
          </Pressable>
        )}
      </Animated.View>
    </SafeAreaView>
  );
}
