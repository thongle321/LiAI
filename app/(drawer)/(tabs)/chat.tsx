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
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
} from "react-native-reanimated";
import {
  KeyboardEvents,
  useReanimatedKeyboardAnimation,
} from "react-native-keyboard-controller";
import { scheduleOnRN } from "react-native-worklets";
import { ChevronDown } from "lucide-react-native";

import { colors, useColors } from "@/themes/tokens.ts";
import { keyboardOcclusion } from "@/utils/keyboard.ts";
import { filterMessages } from "@/services/chat/filter.ts";
import { buildRows, type ChatRow, type MessageRow } from "@/services/chat/rows.ts";
import {
  MOTION_DURATION_MS,
  fadeEntering,
  fadeExiting,
} from "@/utils/motion.ts";
import { useChatStore } from "@/store/chat.ts";
import { useKeyboardStore } from "@/store/keyboard.ts";
import { useModelStore } from "@/store/model-store";
import { useInference } from "@/store/inference.ts";
import { useChatSessionLoader } from "@/hooks/useChatSessionLoader.ts";
import { useChatHealth } from "@/hooks/useChatHealth.ts";
import { useToolCompatWarning } from "@/hooks/useToolCompatWarning.ts";
import { MessageListItem } from "@/components/chat/message-list-item.tsx";
import { ChatEmptyPlaceholder } from "@/components/chat/chat-empty-placeholder.tsx";
import { PendingIndicator } from "@/components/chat/pending-indicator.tsx";
import { MessageInput } from "@/components/chat/message-input.tsx";
import { MessageList } from "@/components/chat/message-list.tsx";
import {
  ContextFullBanner,
  ContextLadderSheet,
} from "@/components/chat/context-full-banner.tsx";
import { labelTokens } from "@/services/chat/context-ladder.ts";
import { useContextLadder } from "@/hooks/useContextLadder.ts";
import { useChatBanner } from "@/hooks/useChatBanner.ts";
import { pickableModels } from "@/services/chat/models.ts";
import { useModelReady } from "@/hooks/useModelReady.ts";
import { GenerationSettingsSheet } from "@/components/chat/generation-settings-sheet.tsx";
import { ChatWarningSnackbar } from "@/components/chat/chat-warning-snackbar.tsx";
import { ChatHeader } from "@/components/chat/chat-header.tsx";
import { ChatPickerSheet } from "@/components/chat/chat-picker-sheet.tsx";
import {
  GreetingBubble,
  SuggestedPromptChips,
} from "@/components/chat/greeting-bubble.tsx";
import { useCompanions } from "@/store/companions.ts";
import { recommendedContextTokens } from "@/services/agent/registry.ts";

export default function ChatRoute() {
  const colors = useColors();
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
  // No in-app producer for this URL. pocketpal's link is companion-keyed
  // (`pocketpal://chat?palId=p1`) and companions are out of scope here, so
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

  useChatSessionLoader();
  useChatHealth();

  // PocketPal parity: the composer is always visible. With no model the send
  // button disables and the field's placeholder names it. The composer's own
  // chevron opens the companion/model picker (PocketPal's pal selector), so
  // both choices are available without leaving the thread. The header title
  // still routes to /models for download and remote setup, and each message
  // keeps "Regenerate with…". `ready` is only the transport health check; the
  // engine-accurate gate (useModelReady) is what the composer's own
  // affordances key off, inside MessageInput. Do not confuse the two
  // when editing either side.
  const ready = connection === "up";
  // The empty placeholder ("Activate Model To Get Started" / "No Models
  // Available") and the companion greeting render as the list's
  // ListEmptyComponent, PocketPal's own placement — the plain inverted
  // list adds no dynamic contentInset of its own, so the centred container
  // is stable in both keyboard states (the overlay-only restriction the
  // keyboard library's scroll view imposed is gone with it). They render
  // only with no model and no conversation.
  const emptyState = messages.length === 0 && query.trim() === "";
  // PocketPal's single-source gate: the placeholder asks whether a MODEL is
  // active, not whether the transport is healthy. Gating it on `connection`
  // made it a health flap — connection is resolved only at mount and on
  // model change, so it goes stale in both directions, and the card could
  // vanish while a model sat loaded. `ready` keeps its real consumers:
  // send-enable and the prompt chips.
  const showPlaceholder = activeModelId === null && emptyState;

  // ---- The companion persona (greeting + chips + load hint) ----------------
  // The bound companion applies to the open conversation; the staged one to the
  // conversation about to start (its greeting greets the empty new chat).
  const sessionCompanionId = useChatStore((s) => s.sessionCompanionId);
  const stagedCompanionId = useChatStore((s) => s.stagedCompanionId);
  const effectiveCompanionId = sessionId !== null ? sessionCompanionId : stagedCompanionId;
  const activeCompanion = useCompanions((s) =>
    effectiveCompanionId === null ? undefined : s.companions.find((p) => p.id === effectiveCompanionId),
  );
  // One notice per model when a companion's talents meet a model that
  // cannot call them (PocketPal parity). The screen resolves the
  // companion; the hook owns the decision and the warned-set.
  useToolCompatWarning(activeCompanion);
  // Greeting only with a loaded model and an EMPTY, unsearched thread —
  // exactly PocketPal's render predicate. Never persisted.
  const greeting =
    emptyState && !showPlaceholder && activeCompanion?.greeting?.text
      ? activeCompanion.greeting
      : undefined;
  // One-shot context hint (PocketPal's usePalLoadHint): a companion whose heavy
  // talent wants a bigger window than the loaded one gets ONE notice per
  // (companion, context, talents) signature. Local engine only — a remote
  // provider reports no n_ctx. Declared BELOW nCtx, which the banner
  // section resolves.
  const hintSeen = useRef<Set<string>>(new Set());

  const motionDuration = MOTION_DURATION_MS;

  // ---- The context banner slot -------------------------------------
  // The banner speaks for the NEWEST assistant turn and nothing else, which
  // is what makes it self-clearing. Deciding WHICH of the five variants
  // renders is services/chat//banner-variant.ts's job; deriving its inputs
  // from a thread is the hook's, so this screen only draws the answer and
  // supplies the state. Both halves moved out in one go: the view-model had
  // no seam to test through while it lived here.
  const nCtx = useInference((s) => s.nCtx);
  useEffect(() => {
    if (activeProviderType !== "local" || activeCompanion === undefined) return;
    if (activeModelId === null) return;
    const names = activeCompanion.pact?.talents.map((t) => t.name) ?? [];
    const wanted = Math.max(0, ...names.map((n) => recommendedContextTokens(n) ?? 0));
    if (wanted === 0 || wanted <= nCtx) return;
    const key = `${activeCompanion.id}|${nCtx}|${names.join(",")}`;
    if (hintSeen.current.has(key)) return;
    hintSeen.current.add(key);
    setChatWarning({
      message: `"${activeCompanion.name}" works best with a bigger context window than the current ${nCtx} — some tool results may not fit.`,
      severity: "warning",
      recoverable: false,
    });
  }, [activeCompanion, nCtx, activeProviderType, activeModelId, setChatWarning]);
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
  const listRef = useRef<FlatList<MessageRow>>(null);
  const [atEnd, setAtEnd] = useState(true);
  // What the list must clear: the tab bar and the safe-area inset below it.
  // The bar's own height is seeded from its class-sum constant and
  // replaced by its measured height (store/keyboard.ts), so a class change
  // cannot silently drift the compensation again.
  const tabBarHeight = useKeyboardStore((s) => s.tabBarHeight);
  // The bar's slot: the distance from any bottom-anchored view in this
  // column to the physical screen bottom. The bar stays MOUNTED while the
  // keyboard opens — PocketPal parity ("nothing unmounts"; the
  // edge-to-edge keyboard simply covers it, pane by pane) — so this value
  // is the SAME in both keyboard states and nothing on this screen is
  // keyed to a store flag any more.
  const keyboardOffset = insets.bottom + tabBarHeight;
  // Height of the field, which IS the composer. NOT a delta from a baseline:
  // the field is out of flow, so nothing else accounts for it. One
  // measurement, three consumers: the list's marginBottom, the empty
  // state's content container, and the jump-to-latest anchor.
  const [composerHeight, setComposerHeight] = useState(0);

  // ============ THE ONE KEYBOARD VALUE (PocketPal ChatView.tsx:457-490) ===
  // This route is the screen's ONLY keyboard reader. Everything that rides
  // the keyboard on this screen — the composer, the list's header spacer,
  // the jump pill, the chips/snackbar row — derives from this single
  // reconciled occlusion value, so no two surfaces can measure (or animate
  // at) different rates and drift. PocketPal's comment states the thesis:
  // "one expression … so they never disagree". The old per-view lifts
  // (useKeyboardLift in the composer AND here) were exactly the
  // two-measurements race behind the reported stuck-lifted composer.
  //
  // The anchor is the bar slot, not PocketPal's bare insets.bottom: the tab
  // bar stays MOUNTED under the keyboard, so the composer rests
  // keyboardOffset above the physical bottom and the keyboard height
  // MINUS that corridor is what it must rise (utils/keyboard.ts documents
  // the arithmetic; passing PocketPal's 0-corridor would overshoot by a
  // full bar slot — the old composer anchor bug).
  const keyboard = useReanimatedKeyboardAnimation();
  const occlusion = useDerivedValue(() =>
    keyboardOcclusion(keyboard.height.value, keyboardOffset),
  );
  // [DEBUG-kbd7] temporary instrumentation — the stuck-composer repro loop.
  console.log(
    `[DEBUG-kbd7] mount keyboardOffset=${keyboardOffset} insetsBottom=${insets.bottom} tabBarHeight=${tabBarHeight}`,
  );
  const logKeyboard = (next: number) => {
    console.log(`[DEBUG-kbd7] keyboard.height=${next}`);
  };
  useAnimatedReaction(
    () => Math.round(keyboard.height.value * 10) / 10,
    (next, previous) => {
      if (next === previous) return;
      scheduleOnRN(logKeyboard, next);
    },
  );
  const logOcclusion = (next: number) => {
    console.log(`[DEBUG-kbd7] occlusion=${next}`);
  };
  useAnimatedReaction(
    () => Math.round(occlusion.value),
    (next, previous) => {
      if (next === previous) return;
      scheduleOnRN(logOcclusion, next);
    },
  );
  useEffect(() => {
    const log =
      (name: string) =>
      (event: { height: number | null; interactive?: boolean }) => {
        console.log(`[DEBUG-kbd7] ${name} h=${event.height}`);
      };
    const subs = (
      [
        "keyboardWillShow",
        "keyboardDidShow",
        "keyboardWillHide",
        "keyboardDidHide",
      ] as const
    ).map((name) => KeyboardEvents.addListener(name, log(name)));
    return () => subs.forEach((sub) => sub.remove());
  }, []);
  const composerLift = useAnimatedStyle(() => ({
    transform: [{ translateY: -occlusion.value }],
  }));

  const handleComposerHeight = useCallback(
    (event: LayoutChangeEvent) => {
      // PocketPal holds a single measured height with no animation
      // (ChatView's useComponentSize): the list's marginBottom reads it,
      // and easing here only lagged the layout. See
      // docs/research/2026-10-29-chat-composer-full-port.md.
      setComposerHeight(event.nativeEvent.layout.height);
    },
    [],
  );

  // Derived from the message itself rather than toggled on send, so it
  // cannot get stuck if a turn is cancelled or the screen is left mid-reply.
  const streaming = messages[messages.length - 1]?.streaming === true;
  const [generationOpen, setGenerationOpen] = useState(false);
  // One chat picker for both halves of PocketPal's ChatPalModelPickerSheet:
  // the empty thread's CTA and the composer's chevron open the same sheet,
  // which lands on Models every time. The companion now lives here rather
  // than in the header.
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
          className="flex-row items-center gap-2 border-b border-border bg-base px-6 py-2"
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
            <Text className="text-quiet">
              {matchLabel}
            </Text>
          )}
        </Animated.View>
      )}

      {/* Composer always mounted (PocketPal ChatView parity): the no-model
          affordance auto-dismisses on activation, no Retry needed. */}
      {/* The chat keyboard architecture (2026-10-29 full port, PocketPal's
          ChatView). What each layer does:
            - the message list: a PLAIN inverted FlatList (MessageList) that
              adds no keyboard inset of its own. It reserves the composer's
              measured height with its marginBottom and the keyboard's
              height with a ListHeaderComponent spacer fed by `occlusion`
              — the same value the composer lifts by.
            - the composer: absolutely positioned at the bottom, lifting by
              `occlusion` (ONE reconciled value derived in THIS route; the
              composer does not measure the keyboard itself). Same for the
              jump pill and the snackbar/chips row — they cannot drift from
              the composer because they ARE the same number.
            - the empty thread (placeholder + greeting): ListEmptyComponent
              content, centred by the container. With no dynamic inset to
              re-centre it, PocketPal's own placement is stable again.
          There is deliberately no wrapper box around the composer and no
          KeyboardAvoidingView: no second box to disagree, no padding-when-
          keyboard layout. */}
      <View className="flex-1">
        <View className="flex-1">
          <MessageList
            listRef={listRef}
            rows={rows}
            composerHeight={composerHeight}
            occlusion={occlusion}
            streaming={streaming}
            onEndVisibleChange={setAtEnd}
            renderRow={(row, widths) => (
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
            )}
            renderPending={(widths) =>
              <PendingIndicator startedAt={turnStartedAt} widths={widths} />
            }
            listEmpty={
              showPlaceholder ? (
                <ChatEmptyPlaceholder
                  onSelectModel={() => setPickerOpen(true)}
                />
              ) : greeting !== undefined && activeCompanion !== undefined ? (
                // The bubbles' own horizontal padding lives inside
                // GreetingBubble (px-4); px-6 here matches the list's p-6 so
                // the bubble keeps the margin it had as overlay content.
                <View className="flex-1 justify-center px-6">
                  <GreetingBubble
                    companionName={activeCompanion.name}
                    greeting={greeting.text}
                  />
                </View>
              ) : null
            }
          />
        </View>
        {/* Jump to latest: an overlay pinned to the content column's
            bottom-right, above the floating composer — pocketpal's FAB
            placement. It lifts on the SAME occlusion value as the composer
            so the two rise welded together, and only appears when the reader
            has actually scrolled away from the end, which is the only time
            the list stopped following along.

            Icon-only, like PocketPal's scroll-to-bottom FAB: a filled
            circle with a chevron-down (their styles.scrollToBottomButton is
            a 35px primary circle, chevron 20 in onPrimary — ours is the
            48dp touch floor DESIGN.md requires, same role). With the label
            gone, the accessibility label carries the whole meaning. */}
        {!atEnd && messages.length > 0 && (
          <Animated.View
            style={[composerLift, { bottom: composerHeight }]}
            className="absolute right-5"
            pointerEvents="box-none"
          >
            <Pressable
              onPress={() => listRef.current?.scrollToOffset({ animated: true, offset: 0 })}
              className="icon-btn rounded-full bg-primary"
              accessibilityRole="button"
              accessibilityLabel="Jump to latest message"
            >
              <ChevronDown size={20} color={colors.onPrimary} />
            </Pressable>
          </Animated.View>
        )}
      </View>

      {/* No "keyboard strip": there is no longer a frame in which the bar
          slot paints base colour, because the bar never unmounts — the
          real bar is there until the keyboard covers it, pane by pane.
          The step it masked was the other half of the reported composer
          flash. */}

      {/* The composer. It IS the floating box: absolutely positioned, out of
          the column's flow, lifting itself, and reporting its own height.
          There is deliberately no wrapper between this screen and the input,
          because a wrapper that only re-exports a transform is a second box
          that can disagree with the one it wraps — which is exactly how the
          empty state came to look like it was sinking while the composer sat
          still, and how the earlier padding/translation split broke the lift. */}
      <MessageInput
        className="absolute inset-x-0 bottom-0"
        occlusion={occlusion}
        sending={sending}
        ready={ready}
        editing={editingTurnId !== null}
        onCancelEdit={cancelEdit}
        onSend={(text, images) => send(text, images)}
        onHeightChange={handleComposerHeight}
        companionName={activeCompanion?.name ?? null}
        onOpenPicker={() => setPickerOpen(true)}
      />
      {/* Composer overlays: the chrome that is NOT part of the field and so
          cannot live inside it. Anchored directly above the field and lifted
          by the SAME occlusion value (composerLift), so the keyboard can
          never strand them; positioned
          over the list rather than in the field's flow, so they reserve
          nothing and the field never resizes when one appears.
          Each carries its own fill because it now sits over message content
          instead of over a bar. */}
      <Animated.View
        style={[composerLift, { bottom: composerHeight }]}
        className="absolute inset-x-0 px-6"
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
          {/* Suggested-prompt chips (PocketPal's chip row): above the
              composer, only on an empty thread with a greeting. Tapping
              one SENDS it like any user message. */}
          {greeting?.suggestedPrompts !== undefined &&
          greeting.suggestedPrompts.length > 0 &&
          !sending ? (
            <SuggestedPromptChips
              prompts={greeting.suggestedPrompts}
              onSend={(text) => void send(text)}
            />
          ) : null}
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
      <ChatPickerSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
      />
    </SafeAreaView>
  );
}
