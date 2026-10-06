/** Chat route: the chat screen itself — message list, typing indicator,
 * composer.
 *
 * Owns its code directly (message-view refactor): the Wave-1 thin route +
 * components/chat/ChatScreen.tsx split is reversed — the screen lives
 * HERE, composing the three message-view components (MessageList,
 * MessageListItem, MessageInput). Messages stream token-by-token into the
 * pending row; completed assistant turns offer copy + regenerate.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useLocalSearchParams,
  useNavigation,
  useRouter,
} from "expo-router";
import Animated, { useSharedValue, withTiming } from "react-native-reanimated";
import { Menu, SquarePen } from "lucide-react-native";

import { colors } from "../../../themes/tokens.ts";
import { filterMessages } from "../../../lib/chat/filter.ts";
import { buildRows, type ChatRow } from "../../../lib/chat/rows.ts";
import {
  MOTION_DURATION_MS,
  fadeEntering,
  fadeExiting,
  usePressFeedback,
} from "../../../lib/motion.ts";
import { APP_NAME } from "../../../constants/app.ts";
import { TAB_BAR_HEIGHT } from "../../../components/BottomNav.tsx";
import { useChatStore } from "../../../store/chat.ts";
import { useModelStore } from "../../../store/modelStore";
import { useInference } from "../../../store/inference.ts";
import { useKeyboardLift } from "../../../hooks/useKeyboardLift.ts";
import { useKeyboardState } from "react-native-keyboard-controller";
import { MessageListItem } from "../../../components/chat/MessageListItem.tsx";
import { ChatEmptyPlaceholder } from "../../../components/chat/ChatEmptyPlaceholder.tsx";
import { DateHeader } from "../../../components/chat/DateHeader.tsx";
import { PendingIndicator } from "../../../components/chat/PendingIndicator.tsx";
import { MessageInput } from "../../../components/chat/MessageInput.tsx";
import { UsageStats } from "../../../components/chat/UsageStats.tsx";
import { SuggestedPrompts } from "../../../components/chat/SuggestedPrompts.tsx";
import { MessageList } from "../../../components/chat/MessageList.tsx";
import {
  ContextFullBanner,
  ContextLadderSheet,
} from "../../../components/chat/ContextFullBanner.tsx";
import { effectiveNCtx, fillPercent } from "../../../lib/chat/context-fill.ts";
import { labelTokens } from "../../../lib/chat/context-ladder.ts";
import { useContextLadder } from "../../../hooks/useContextLadder.ts";
import {
  type BannerVariant,
  consecutiveFullFailures,
  dismissBanner,
  resolveBannerVariant,
} from "../../../lib/chat/banner-variant.ts";
import { talentDefinitions } from "../../../lib/agent/registry.ts";
import { pickableModels } from "../../../lib/chat/models.ts";
import { useModelReady } from "../../../hooks/useModelReady.ts";
import { GenerationSettingsSheet } from "../../../components/chat/GenerationSettingsSheet.tsx";
import { ChatWarningSnackbar } from "../../../components/chat/ChatWarningSnackbar.tsx";
import { ChatMenu } from "../../../components/chat/ChatMenu.tsx";

export default function ChatRoute() {
  const messages = useChatStore((s) => s.messages);
  // The header names the conversation and the model answering it; both
  // live here (G11 — the active model was otherwise invisible on this
  // screen after a switch from the menu).
  const sessionId = useChatStore((s) => s.sessionId);
  const sessions = useChatStore((s) => s.sessions);
  const setDraft = useChatStore((s) => s.setDraft);

  // G16: prefill the composer from a `?message=` deep link.
  //
  // PocketParity: ChatScreen.tsx:272-273 hands `pendingMessage` to the
  // composer as `initialInputText` and calls `onInitialTextConsumed` to
  // clear it -- the field is filled ONCE. The ref is our equivalent of
  // that consumed flag: without it the effect re-fires on every render
  // and would stomp whatever the user had typed since.
  //
  // No in-app producer for this URL. pocketpal's link is pal-keyed
  // (`pocketpal://chat?palId=p1`) and pals are out of scope here, so
  // this only fires when an external app or Shortcut hands LiAI a
  // `liai://chat?message=...`. Deliberate, and recorded in the audit.
  const { message: deepLinkPrompt } = useLocalSearchParams<{ message?: string }>();
  const consumedDeepLink = useRef<string | null>(null);
  useEffect(() => {
    if (deepLinkPrompt === undefined) {
      // The link is gone, so the NEXT one is a fresh arrival even when it
      // carries identical text. PocketParity parks the message and clears
      // it, so a repeated `?message=hello` fills the field again; keying
      // only on the value would silently swallow it as a duplicate.
      consumedDeepLink.current = null;
      return;
    }
    if (consumedDeepLink.current === deepLinkPrompt) return;
    consumedDeepLink.current = deepLinkPrompt;
    const text = deepLinkPrompt.trim();
    if (text !== "") setDraft(text);
  }, [deepLinkPrompt, setDraft]);
  const connection = useChatStore((s) => s.connection);
  const sending = useChatStore((s) => s.sending);
  const stopping = useChatStore((s) => s.stopping);
  const loadSession = useChatStore((s) => s.loadSession);
  const checkHealth = useChatStore((s) => s.checkHealth);
  const send = useChatStore((s) => s.send);
  const retry = useChatStore((s) => s.retry);
  const regenerate = useChatStore((s) => s.regenerate);
  const newConversation = useChatStore((s) => s.newConversation);
  const startEdit = useChatStore((s) => s.startEdit);
  const editingTurnId = useChatStore((s) => s.editingTurnId);
  const cancelEdit = useChatStore((s) => s.cancelEdit);
  const turnStartedAt = useChatStore((s) => s.turnStartedAt);
  const chatWarning = useChatStore((s) => s.chatWarning);
  const setChatWarning = useChatStore((s) => s.setChatWarning);
  // Stable identity matters here: the snackbar's auto-dismiss timer is
  // keyed on its onDismiss, so an inline arrow would restart the dwell on
  // every parent render and the notice would never expire.
  const dismissWarning = useCallback(
    () => setChatWarning(null),
    [setChatWarning],
  );
  const setActiveModel = useModelStore((s) => s.setActiveModel);
  const setActiveRemoteApi = useModelStore((s) => s.setActiveRemoteApi);
  const allModels = useModelStore((s) => s.models);
  const remoteApis = useModelStore((s) => s.remoteApis);
  // Regenerate and edit both start a turn, so they need a live engine —
  // the same gate the composer uses.
  const canRun = useModelReady();
  const activeModelId = useModelStore((s) => s.activeModelId);
  const activeProviderType = useModelStore((s) => s.activeProviderType);
  // C4: a remote thread's window comes from the C7 /props caps, never
  // from the local inference setting.
  const remoteCaps = useModelStore((s) => s.remoteCaps);
  const menuModels = useMemo(
    () => pickableModels(allModels, remoteApis, activeModelId),
    [allModels, remoteApis, activeModelId],
  );
  /** Switch to a model chosen from a message's "Regenerate with…".
   *
   *  Uses the SAME discriminator the two menus label with -- a local entry
   *  has no `host`. Asking `remoteApis.some(...)` instead would be an
   *  opposite test on the same list: the day a local id equalled a remote
   *  id, the menu would say "local" and this would switch as remote. */
  const switchToModel = useCallback(
    (modelId: string) => {
      const target = menuModels.find((m) => m.id === modelId);
      if (target === undefined) return;
      if (target.host === undefined) setActiveModel(modelId, "local");
      else setActiveRemoteApi(modelId);
    },
    [menuModels, setActiveModel, setActiveRemoteApi],
  );
  const activeModelLabel = useMemo(() => {
    const m = menuModels.find((x) => x.active);
    if (m === undefined) return null;
    // Same `name (host)` shape the menus use. Dropping the host here
    // would reintroduce the exact ambiguity G11 exists to remove: two
    // providers offering "qwen" would be indistinguishable in the one
    // place whose job is saying which model is answering.
    return m.host === undefined ? m.name : `${m.name} (${m.host})`;
  }, [menuModels]);
  const activeSessionTitle = useMemo(
    () => sessions.find((s) => s.id === sessionId)?.title ?? null,
    [sessions, sessionId],
  );
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  const visible = searchOpen ? filterMessages(messages, query) : messages;
  // Adapter rows for the list: date headers + group/avatar/status flags.
  // Memoized so the list's row-count follow effect can't retrigger on
  // identity churn — a re-render alone must never move the list.
  const rows = useMemo(
    () => buildRows(visible, { sending, stopping }),
    [visible, sending, stopping],
  );
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
  useEffect(() => {
    void checkHealth();
  }, [activeModelId, checkHealth]);

  // PocketPal parity: the composer is always visible. With no model the send
  // button disables and the field's placeholder names it. There is
  // deliberately NO in-composer prompt or button: the models screen is
  // reached from the header title, which names the conversation and the
  // model answering it, and the empty thread has its own card with a
  // button. `ready` is only the transport health check; the
  // engine-accurate gate (useModelReady) is what the composer's own
  // affordances key off, inside MessageInput. Do not confuse the two
  // when editing either side.
  const ready = connection === "up";
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

  const motionDuration = MOTION_DURATION_MS;

  // ---- The context banner slot -------------------------------------
  // It speaks for the NEWEST assistant turn and nothing else. Scoping it
  // that way makes it self-clearing: keep chatting, answer successfully,
  // and the banner goes away on its own without a reset rule. Which of
  // the five variants renders is lib/chat/banner-variant.ts's decision —
  // the screen only collects the state and draws the answer.
  const newestAssistant = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === "assistant") return messages[i];
    }
    return null;
  }, [messages]);
  // Dismissals are held PER SESSION and cleared when each turn is
  // recorded, so a banner stays gone for exactly one turn and the next
  // occurrence of the same problem speaks again.
  const [dismissed, setDismissed] = useState<Set<BannerVariant>>(
    () => new Set<BannerVariant>(),
  );
  const turnCount = messages.length;
  useEffect(() => {
    setDismissed(new Set<BannerVariant>());
  }, [turnCount]);
  const [ladderOpen, setLadderOpen] = useState(false);
  const nCtx = useInference((s) => s.nCtx);
  // The same ladder the sheet draws, so the banner's more-room action and
  // the sheet's picker can never disagree about what fits.
  const ladder = useContextLadder(nCtx);
  // C4: the window this thread divides by. Local = configured nCtx;
  // remote = the C7 /props contextLength, which is unknown until a probe
  // lands — and an unknown window never warns and never fills.
  const isRemote = activeProviderType === "remote";
  const windowSize = effectiveNCtx({
    isRemote,
    localNCtx: nCtx,
    remoteContextLength:
      activeProviderType === "remote" && activeModelId?.startsWith("remote-")
        ? remoteCaps[activeModelId.slice("remote-".length)]?.contextLength
        : undefined,
  });
  // Every HTML preview surface in the conversation. The soft-cap notice
  // reads this and NO model state, which is why it can appear with no
  // model loaded.
  const htmlPreviewCount = useMemo(() => {
    let n = 0;
    for (const m of messages) {
      for (const step of m.steps ?? []) {
        if (step.tool === "render_html" && step.ok !== false) n += 1;
      }
    }
    return n;
  }, [messages]);
  // The turn's LAST tool, when its definition declares a recommended
  // context cost. No talent declares one yet, so this reads undefined
  // until one does — the field is opt-in precisely so that day changes
  // nothing else.
  const heavyToolName = useMemo(() => {
    const steps = newestAssistant?.steps ?? [];
    for (let i = steps.length - 1; i >= 0; i -= 1) {
      const def = talentDefinitions().find(
        (t) => t.function.name === steps[i].tool,
      );
      if (def?.function.recommendedContextTokens !== undefined) {
        return def.function.name;
      }
    }
    return undefined;
  }, [newestAssistant]);
  const fullFailures = useMemo(
    () =>
      consecutiveFullFailures(
        messages
          .filter((m) => m.role === "assistant")
          .map((m) => m.outcome ?? {}),
      ),
    [messages],
  );
  const banner = useMemo(
    () =>
      resolveBannerVariant(
        newestAssistant
          ? {
              ...(newestAssistant.outcome?.contextFull !== undefined
                ? { contextFull: newestAssistant.outcome.contextFull }
                : {}),
              ...(newestAssistant.usage !== undefined
                ? {
                    promptTokens: newestAssistant.usage.promptTokens,
                    completionTokens: newestAssistant.usage.completionTokens,
                  }
                : {}),
              ...(newestAssistant.outcome?.stoppedEarly !== undefined
                ? { stoppedEarly: newestAssistant.outcome.stoppedEarly }
                : {}),
              content: newestAssistant.text,
            }
          : undefined,
        {
          windowSize,
          isRemote,
          modelLoaded: activeModelId !== null,
          htmlPreviewCount,
          dismissed,
          consecutiveFullFailures: fullFailures,
          ...(heavyToolName !== undefined ? { heavyToolName } : {}),
        },
      ),
    [
      newestAssistant,
      windowSize,
      isRemote,
      activeModelId,
      htmlPreviewCount,
      dismissed,
      fullFailures,
      heavyToolName,
    ],
  );
  const bannerShowing = banner.variant !== "none";
  const contextFullShowing = banner.variant === "context-full";
  const navigation = useNavigation<{ openDrawer: () => void }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<ChatRow>>(null);
  const [atEnd, setAtEnd] = useState(true);
  const [listHeight, setListHeight] = useState(0);
  // What the list must clear: the tab bar and the safe-area inset below it.
  const keyboardOffset = insets.bottom + TAB_BAR_HEIGHT;
  // The tab bar renders null while the keyboard is up ((tabs)/_layout.tsx:42),
  // so the screen — and this column with it — GROWS by exactly that much. A
  // vertically centred child would then slide down by half of it, which is
  // what made the "No Models Available" card look like it moved when the
  // keyboard opened. The keyboard height is not the cause; this is. Give the
  // two column-anchored overlays the same bottom back so their centring box is
  // identical in both states. The screen-anchored ones need nothing.
  const keyboardVisible = useKeyboardState((s) => s.isVisible);
  const tabBarCompensation = keyboardVisible ? keyboardOffset : 0;
  // Height of the field, which IS the composer. NOT a delta from a baseline,
  // unlike the library's example: the field is out of flow, so nothing else
  // accounts for it and the newest message would sit behind it. The banners
  // above it are deliberately NOT in this number — they are overlays over the
  // list, and reserving for them would make the list reflow every time a chip
  // appeared. One measurement, three consumers: this padding, the empty
  // state's lift, and the jump-to-latest anchor.
  const extraContentPadding = useSharedValue(0);
  const [composerHeight, setComposerHeight] = useState(0);
  // Minimum bottom inset while a reply streams, so the sent message is
  // pushed up and the response has somewhere to appear.
  const blankSpace = useSharedValue(0);

  // The composer floats and lifts ITSELF — MessageInput calls useKeyboardLift,
  // so there is no wrapper box between this screen and the input. The only
  // thing left to lift here is the jump-to-latest overlay, and it uses the
  // same hook so the two rise welded together instead of tracking the
  // keyboard independently and drifting apart.
  //
  // No KeyboardAvoidingView on this screen: the library's own guide lists four
  // ways it falls short on chat layouts and ships KeyboardChatScrollView for
  // the list, which MessageList renders. KeyboardGestureArea is deliberately
  // absent too: the guide pairs it with keyboardDismissMode="interactive" so
  // the accessory follows the drag, but it is not exported in 1.21.9 (the docs
  // are on main/1.22). Interactive dismissal still works via keyboardDismissMode
  // on the scroll view; only the composer tracking the finger needs 1.22+.
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
  const penPress = usePressFeedback();
  const [generationOpen, setGenerationOpen] = useState(false);
  const searchBarEntering = fadeEntering(motionDuration);
  const searchBarExiting = fadeExiting(motionDuration);

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{ flex: 1, backgroundColor: colors.base }}
    >
      {/* 56px header on Clean White with a 1px Hairline bottom. Both slots
          are w-36 (144px): the trailing group is three 48px targets, so
          equal slots must be sized to the WIDER group or its overflow eats
          the wordmark's flex space and shifts it off-centre. */}
      <View className="h-14 flex-row items-center border-b border-border bg-surface-1 px-5">
        <View className="w-36 flex-row items-center">
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
          onPress={() => router.navigate("/models")}
          className="flex-1 items-center"
          accessibilityRole="button"
          accessibilityLabel={
            activeModelLabel === null ? "Open models" : `Open models — ${activeModelLabel}`
          }
        >
          {/* Two lines, like PocketPal's ChatHeaderTitle: the conversation,
              then the model answering it. Without the second line, a model
              switched from the menu was invisible until the answer came
              back wrong. The wordmark only stands in until a session
              exists, so an unsent chat still reads as the app's own. */}
          <Text
            numberOfLines={1}
            // Capped like ScreenHeader's title: DESIGN pins the
            // header at 56px (Fluid Type Rule caps geometry).
            maxFontSizeMultiplier={1.5}
            className="text-center font-sans-semibold text-title text-primary-text"
          >
            {activeSessionTitle ?? APP_NAME}
          </Text>
          {activeModelLabel !== null && (
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.5}
              className="text-center font-sans text-caption text-secondary-text"
            >
              {activeModelLabel}
            </Text>
          )}
        </Pressable>
        <View className="w-36 flex-row items-center justify-end">
          {/* Pen (pocketpal's reset-button) leads, the kebab trails —
              their HeaderRight order. The slot stays w-36. */}
          <Animated.View style={penPress.animatedStyle}>
            <Pressable
              onPress={() => {
                // The pen starts a fresh chat; a stale search bar must
                // not outlive the conversation it was filtering.
                setSearchOpen(false);
                setQuery("");
                void newConversation();
              }}
              onPressIn={penPress.onPressIn}
              onPressOut={penPress.onPressOut}
              className="h-12 w-12 items-center justify-center"
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel="New conversation"
            >
              <SquarePen size={20} color={colors.primaryText} />
            </Pressable>
          </Animated.View>
          <ChatMenu
            onOpenGeneration={() => setGenerationOpen(true)}
            onOpenSearch={() => {
              setSearchOpen(true);
              setQuery("");
            }}
          />
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
      <View className="flex-1">
        <View
          className="flex-1"
          onLayout={(e) => setListHeight(e.nativeEvent.layout.height)}
        >
          <MessageList
            listRef={listRef}
            rows={rows}
            offset={keyboardOffset}
            extraContentPadding={extraContentPadding}
            blankSpace={blankSpace}
            onEndVisibleChange={setAtEnd}
            streaming={streaming}
            renderRow={(row) =>
              row.kind === "date" ? (
                <DateHeader label={row.label} />
              ) : row.kind === "pending" ? (
                <PendingIndicator startedAt={turnStartedAt} />
              ) : (
                <MessageListItem
                  row={row}
                  onRetry={() => void retry(row.message.id)}
                  contextBannerVisible={contextFullShowing}
                  canRun={canRun}
                  models={menuModels}
                  onEdit={() => startEdit(row.message.id)}
                  onRegenerateWith={(modelId: string) => {
                    // Switch first, then re-answer: EngineManager swaps
                    // the slot on the next ensure(), so the rerun lands on
                    // the model the user picked.
                    switchToModel(modelId);
                    void regenerate(row.message.id);
                  }}
                  onRegenerate={
                    row.message.role === "assistant"
                      ? () => void regenerate(row.message.id)
                      : null
                  }
                />
              )
            }
          />
        </View>
        {/* The no-model empty state, as an overlay rather than scroll content.
            MessageList's header explains why: a ListEmptyComponent would sit
            inside the keyboard's contentInset and visibly re-centre as the
            keyboard rose. The bottom padding lifts it clear of the floating
            composer, from the measured height rather than pocketpal's
            hard-coded bottomComponentHeight + 100. */}
        {showPlaceholder && (
          <View
            className="absolute inset-x-0 top-0"
            style={{ bottom: composerHeight + tabBarCompensation }}
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
            style={[composerLift, { bottom: composerHeight + tabBarCompensation }]}
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
      <MessageInput
        className="absolute inset-x-0 bottom-0"
        sending={sending}
        ready={ready}
        editing={editingTurnId !== null}
        onCancelEdit={cancelEdit}
        onSend={(text, images) => send(text, images)}
        onHeightChange={handleComposerHeight}
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
        {/* No active-run chip: the pending row inside the list owns that
            state (PocketPal PendingIndicator). sending and the pending row
            coincide — send/retry/regenerate mint the streaming stub in the
            same set() — so a chip would be a second indicator for one
            state, overlapping the list instead of scrolling with it. */}
        {/* The transient notice outranks the persistent banner: it is about the
    turn that just happened, while the banner is standing context. */}
          <ChatWarningSnackbar
            warning={chatWarning}
            onDismiss={dismissWarning}
          />
  {/* `?? 0` is dead-in-practice: a FULL banner implies the local engine
      (remote hardcodes contextFull: false) so windowSize is nCtx there,
      and the warning branch only renders when the resolver already saw
      a real window. fillPercent(…, 0) would read 0 rather than divide
      blind. */}
  {bannerShowing && (
    <ContextFullBanner
      variant={banner.variant}
      copy={banner.copy}
      heavyToolName={banner.heavyToolName}
      fill={fillPercent(newestAssistant?.usage?.promptTokens, windowSize ?? 0)}
      onMoreRoom={() => setLadderOpen(true)}
      // The banner keeps the local/remote rule for this action; we add only
      // the ladder's verdict, so it is absent when nothing larger fits.
      canIncrease={banner.copy !== "remote" && ladder.anyFits}
      onNewChat={() => {
        setDismissed(dismissBanner(dismissed, banner.variant));
        void newConversation();
      }}
      onDismiss={() => setDismissed(dismissBanner(dismissed, banner.variant))}
    />
  )}
        {ready && emptyState && (
          <SuggestedPrompts onPick={(prompt) => void send(prompt)} />
        )}
        <UsageStats messages={messages} />
      </Animated.View>
      {/* The ladder lives OUTSIDE the overlay row: it is a modal sheet
          with its own scrim, so it must not inherit the composer's lift
          transform or it would ride up with the keyboard. */}
      <ContextLadderSheet
        visible={ladderOpen}
        currentNctx={nCtx}
        onResult={(success, tokens) =>
          setChatWarning({
            message: success
              ? `Context set to ${labelTokens(tokens)}. The model reloaded.`
              : `Couldn't load ${labelTokens(tokens)} — back at ${labelTokens(nCtx)} context.`,
            severity: success ? "warning" : "error",
            recoverable: false,
          })
        }
        onNewChat={() => {
          if (banner.variant !== "none") {
            setDismissed(dismissBanner(dismissed, banner.variant));
          }
          void newConversation();
        }}
        onClose={() => setLadderOpen(false)}
      />
      {/* Sampling is per conversation and lives here, not in Settings —
          the same split PocketPal uses. */}
      <GenerationSettingsSheet
        visible={generationOpen}
        onClose={() => setGenerationOpen(false)}
      />
    </SafeAreaView>
  );
}
