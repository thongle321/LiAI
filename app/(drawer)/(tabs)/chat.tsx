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
import { ChevronDown } from "lucide-react-native";

import { colors } from "../../../themes/tokens.ts";
import { filterMessages } from "../../../services/chat/filter.ts";
import { buildRows, type ChatRow } from "../../../services/chat/rows.ts";
import {
  MOTION_DURATION_MS,
  fadeEntering,
  fadeExiting,
} from "../../../utils/motion.ts";
import { useChatStore } from "../../../store/chat.ts";
import { useKeyboardStore } from "../../../store/keyboard.ts";
import { useModelStore } from "../../../store/modelStore";
import { useInference } from "../../../store/inference.ts";
import { useKeyboardLift } from "../../../hooks/useKeyboardLift.ts";
import { MessageListItem } from "../../../components/chat/message-list-item.tsx";
import { ChatEmptyPlaceholder } from "../../../components/chat/chat-empty-placeholder.tsx";
import { PendingIndicator } from "../../../components/chat/pending-indicator.tsx";
import { MessageInput } from "../../../components/chat/message-input.tsx";
import { SuggestedPrompts } from "../../../components/chat/suggested-prompts.tsx";
import { MessageList } from "../../../components/chat/message-list.tsx";
import {
  ContextFullBanner,
  ContextLadderSheet,
} from "../../../components/chat/context-full-banner.tsx";
import { labelTokens } from "../../../services/chat/context-ladder.ts";
import { useContextLadder } from "../../../hooks/useContextLadder.ts";
import { useChatBanner } from "../../../hooks/useChatBanner.ts";
import { pickableModels } from "../../../services/chat/models.ts";
import { useModelReady } from "../../../hooks/useModelReady.ts";
import { GenerationSettingsSheet } from "../../../components/chat/generation-settings-sheet.tsx";
import { ChatWarningSnackbar } from "../../../components/chat/chat-warning-snackbar.tsx";
import { ChatHeader } from "../../../components/chat/chat-header.tsx";
import { ModelPickerSheet } from "../../../components/chat/model-picker-sheet.tsx";

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
  // The failed turn's own retry, which used to live on the card this screen
  // no longer renders. The snackbar carries no message id, so the newest
  // message still carrying an error is the turn it stands for — the same
  // turn the deleted card sat on.
  const retryFailedTurn = () => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.error !== undefined) {
        void retry(m.id);
        return;
      }
    }
  };
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
  // Row actions carry the message id instead of closing over the row: a
  // per-row arrow is a fresh prop identity on every screen render, which
  // defeats memo(MessageListItem) and re-renders every visible row on each
  // keyboard toggle — the jank half of the reported flash with a model
  // loaded. Rows are memoized, so stable handlers let a keyboard toggle
  // skip the rows entirely. startEdit already has this exact signature and
  // identity, so it passes through unwrapped; the other two bind the id
  // onto a store action that takes only part of it.
  const handleRegenerate = useCallback(
    (messageId: string) => {
      void regenerate(messageId);
    },
    [regenerate],
  );
  const handleRegenerateWith = useCallback(
    (messageId: string, modelId: string) => {
      // Switch first, then re-answer: EngineManager swaps the slot on the
      // next ensure(), so the rerun lands on the model the user picked.
      switchToModel(modelId);
      void regenerate(messageId);
    },
    [switchToModel, regenerate],
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
  // Adapter rows for the list: group/avatar/status flags. No day dividers
  // — PocketPal's date-header prop defaults false and their screen never
  // passes it, so their chat has none either (services/chat//rows.ts).
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
  // PocketPal's single-source gate: the placeholder asks whether a MODEL is
  // active, not whether the transport is healthy. Gating it on `connection`
  // made it a health flap — connection is resolved only at mount and on
  // model change, so it goes stale in both directions, and the card could
  // vanish while a model sat loaded. `ready` keeps its real consumers:
  // send-enable and the prompt chips.
  const showPlaceholder = activeModelId === null && emptyState;

  const motionDuration = MOTION_DURATION_MS;

  // ---- The context banner slot -------------------------------------
  // The banner speaks for the NEWEST assistant turn and nothing else, which
  // is what makes it self-clearing. Deciding WHICH of the five variants
  // renders is services/chat//banner-variant.ts's job; deriving its inputs
  // from a thread is the hook's, so this screen only draws the answer and
  // supplies the state. Both halves moved out in one go: the view-model had
  // no seam to test through while it lived here.
  const nCtx = useInference((s) => s.nCtx);
  const {
    banner,
    bannerShowing,
    contextFullShowing,
    fill,
    dismiss: dismissBanner,
  } = useChatBanner({
    messages,
    nCtx,
    activeModelId,
    activeProviderType,
    remoteCaps,
  });
  const [ladderOpen, setLadderOpen] = useState(false);
  // The same ladder the sheet draws, so the banner's more-room action and
  // the sheet's picker can never disagree about what fits.
  const ladder = useContextLadder(nCtx);
  const navigation = useNavigation<{ openDrawer: () => void }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<ChatRow>>(null);
  const [atEnd, setAtEnd] = useState(true);
  const [listHeight, setListHeight] = useState(0);
  // What the list must clear: the tab bar and the safe-area inset below it.
  // The bar's own height is seeded from its class-sum constant and
  // replaced by its measured height (store/keyboard.ts), so a class change
  // cannot silently drift the compensation again.
  const tabBarHeight = useKeyboardStore((s) => s.tabBarHeight);
  const keyboardOffset = insets.bottom + tabBarHeight;
  // The tab bar renders null while the keyboard is up ((tabs)/_layout.tsx:42),
  // so the screen — and this column with it — GROWS by exactly that much. A
  // vertically centred child would then slide down by half of it, which is
  // what made the "No Models Available" card look like it moved when the
  // keyboard opened. The keyboard height is not the cause; this is. Give the
  // two column-anchored overlays the same bottom back so their centring box is
  // identical in both states. The screen-anchored ones need nothing.
  //
  // PocketPal solves this by NOT HAVING the moving part: their navigation is
  // a drawer, so nothing unmounts on keyboard open and their centring box is
  // invariant by construction rather than by compensation
  // (pocketpal-ai/src/components/ChatView/ChatView.tsx:1175, styles.ts:70-75).
  // We keep the tab bar, so the column grows by one bar slot — and that
  // growth is a STEP, not a ramp: `keyboardVisible` is a JS-thread store flag
  // that flips once, and `(tabs)/_layout.tsx` returns null in that commit.
  //
  // So the compensation MUST be a step in that same commit. An earlier
  // attempt animated it off `keyboard.height` to "match the composer's
  // curve" and that was wrong in a way this comment exists to prevent: for
  // the whole rise the overlay was a bar slot too tall, so the centred card
  // sat low and then snapped up. A step matched to a ramp is a worse version
  // of the flash it was meant to remove.
  const keyboardVisible = useKeyboardStore((s) => s.isVisible);
  const tabBarCompensation = keyboardVisible ? keyboardOffset : 0;
  const [composerHeight, setComposerHeight] = useState(0);
  // Height of the field, which IS the composer. NOT a delta from a baseline,
  // unlike the library's example: the field is out of flow, so nothing else
  // accounts for it and the newest message would sit behind it. The banners
  // above it are deliberately NOT in this number — they are overlays over the
  // list, and reserving for them would make the list reflow every time a chip
  // appeared. One measurement, three consumers: this padding, the empty
  // state's lift, and the jump-to-latest anchor.
  const extraContentPadding = useSharedValue(0);
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
      // Reserve the composer's height directly rather than easing into it:
      // easing here only lagged the layout by ~MOTION_DURATION_MS, which
      // left the newest message briefly overlapping (or gapped from) the
      // composer during the spring. PocketPal holds a single measured
      // height with no animation, so we match that. See docs/research/...
      // (keyboard/composer revert) for the scroll-follow follow-up.
      setComposerHeight(height);
      extraContentPadding.value = height;
    },
    [extraContentPadding],
  );

  // Derived from the message itself rather than toggled on send, so it
  // cannot get stuck if a turn is cancelled or the screen is left mid-reply.
  const streaming = messages[messages.length - 1]?.streaming === true;
  // Reserve scroll room for a streaming reply directly, instead of easing
  // into it. The eased version ran one duration behind the token stream and
  // fought the follow-scroll; a hard reserve keeps blankSpace coincident
  // with the streaming flag (PocketPal: no timing on the equivalent value).
  useEffect(() => {
    blankSpace.value = streaming ? listHeight : 0;
  }, [streaming, listHeight, blankSpace]);
  const [generationOpen, setGenerationOpen] = useState(false);
  // PocketPal's in-chat model picker: opened from the empty thread's CTA so
  // activating a model no longer means leaving the conversation. There is
  // deliberately no composer chevron (that decision predates this: the
  // header title routes to /models, and each message offers "Regenerate
  // with…"); the picker is the no-model path only.
  const [pickerOpen, setPickerOpen] = useState(false);
  const searchBarEntering = fadeEntering(motionDuration);
  const searchBarExiting = fadeExiting(motionDuration);

  // SafeAreaView comes from react-native-safe-area-context, which Uniwind
  // does NOT patch: its className prop is ignored outright (Uniwind's own
  // SafeAreaView wraps React Native's, reachable only via uniwind/components).
  // So this box is styled with `style`, per the Style Exception List, and
  // `flex: 1` is load-bearing rather than decoration: without it the box
  // shrink-wraps its content and every `absolute bottom-0` inside it (the
  // composer, the overlay group) resolves against a box that no longer
  // reaches the bottom of the screen -- which put the composer at the top of
  // the screen, on top of the header.
  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{ flex: 1, backgroundColor: colors.base }}
    >
      <ChatHeader
        title={activeSessionTitle}
        modelLabel={activeModelLabel}
        onOpenModels={() => router.navigate("/models")}
        onOpenDrawer={() => navigation.openDrawer()}
        onNewConversation={() => {
          // The pen starts a fresh chat; a stale search bar must
          // not outlive the conversation it was filtering.
          setSearchOpen(false);
          setQuery("");
          void newConversation();
        }}
        onOpenGeneration={() => setGenerationOpen(true)}
        onOpenSearch={() => {
          setSearchOpen(true);
          setQuery("");
        }}
      />
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
            renderRow={(row, widths) =>
              row.kind === "pending" ? (
                <PendingIndicator startedAt={turnStartedAt} widths={widths} />
              ) : (
                <MessageListItem
                  row={row}
                  widths={widths}
                  contextBannerVisible={contextFullShowing}
                  canRun={canRun}
                  models={menuModels}
                  onEdit={startEdit}
                  onRegenerateWith={handleRegenerateWith}
                  onRegenerate={
                    row.message.role === "assistant" ? handleRegenerate : null
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
          <Animated.View
            className="absolute inset-x-0 top-0"
            style={{ bottom: composerHeight + tabBarCompensation }}
            pointerEvents="box-none"
          >
            <ChatEmptyPlaceholder
              onSelectModel={() => setPickerOpen(true)}
            />
          </Animated.View>
        )}
        {/* Jump to latest: an overlay pinned to the content column's
            bottom-right, above the floating composer — pocketpal's FAB
            placement. It lifts on the same hook as the composer so the two
            rise welded together, and only appears when the reader has
            actually scrolled away from the end, which is the only time the
            list stopped following along.

            Icon-only, like PocketPal's scroll-to-bottom FAB: a filled
            circle with a chevron-down (their styles.scrollToBottomButton is
            a 35px primary circle, chevron 20 in onPrimary — ours is the
            48dp touch floor DESIGN.md requires, same role). With the label
            gone, the accessibility label carries the whole meaning. */}
        {!atEnd && messages.length > 0 && (
          <Animated.View
            style={[composerLift, { bottom: composerHeight + tabBarCompensation }]}
            className="absolute right-5"
            pointerEvents="box-none"
          >
            <Pressable
              onPress={() => listRef.current?.scrollToEnd({ animated: true })}
              className="icon-btn rounded-full bg-primary"
              accessibilityRole="button"
              accessibilityLabel="Jump to latest message"
            >
              <ChevronDown size={20} color={colors.onPrimary} />
            </Pressable>
          </Animated.View>
        )}
      </View>

      {/* Keyboard strip. While the keyboard animates in, the frames between
          the tab bar unmounting and the keyboard covering its slot would
          show this screen's base colour where the bar's Clean White used to
          be — a colour flash on every open and close (most exposed with a
          model loaded, because then the strip is visible rather than covered
          by the placeholder card). This is the bar's own colour and height,
          flipped by the SAME store in the SAME commit as the bar's unmount,
          so no frame mixes the two. Behind the fully open keyboard it is
          invisible; it exists only for the transition.

          Paint order is load-bearing: it sits BEFORE the composer and the
          overlay group precisely so they paint OVER it. Those are lifted by
          the keyboard, so for the transition frames their lower edges cross
          this band — and the composer's control row carries coloured
          buttons (the send fill). A strip above them would hide the send
          button for the length of the keyboard animation. pointerEvents is
          none, so the only thing this box can do is paint. */}
      {keyboardVisible && (
        <View
          className="absolute inset-x-0 bottom-0 bg-surface-1"
          style={{ height: keyboardOffset }}
          pointerEvents="none"
        />
      )}

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
            onRetry={retryFailedTurn}
          />
  {/* The banner's own resolution — which of five, plus its fill — is
      useChatBanner's answer; this only draws it. */}
  {bannerShowing && (
    <ContextFullBanner
      variant={banner.variant}
      copy={banner.copy}
      heavyToolName={banner.heavyToolName}
      fill={fill}
      onMoreRoom={() => setLadderOpen(true)}
      // The banner keeps the local/remote rule for this action; we add only
      // the ladder's verdict, so it is absent when nothing larger fits.
      canIncrease={banner.copy !== "remote" && ladder.anyFits}
      onNewChat={() => {
        dismissBanner();
        void newConversation();
      }}
      onDismiss={dismissBanner}
    />
  )}
        {ready && emptyState && (
          <SuggestedPrompts onPick={(prompt) => void send(prompt)} />
        )}
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
          if (bannerShowing) dismissBanner();
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
      <ModelPickerSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
      />
    </SafeAreaView>
  );
}
