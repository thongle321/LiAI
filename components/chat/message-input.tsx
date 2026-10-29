/** Message input: the composer — text field, attach, companion/model picker,
 *  thinking and voice, with send at the trailing edge.
 *
 *  Renamed from ChatInput.tsx (message-view refactor): same behavior, new
 *  name. The composer attach button opens the camera/gallery picker, and the
 *  thinking pill toggles the model's reasoning mode.
 *
 *  2026-10-29 full port: the composer no longer reads the keyboard itself.
 *  The route derives ONE reconciled occlusion value (PocketPal's ChatView
 *  thesis — "one expression … so they never disagree") and hands it here; a
 *  second hook reading `keyboard.height` was the two-measurements race the
 *  reported stuck-lifted composer came from.
 */

import { useEffect, useState } from "react";
import {
  Image as RNImage,
  Pressable,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { Brain, Camera, ChevronUp, Image as ImageIcon, Pencil, Plus, Send, Square, X, type LucideIcon } from "lucide-react-native";
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";
import { KeyboardControllerNative } from "react-native-keyboard-controller";

import * as Haptics from "expo-haptics";

import { useColors } from "@/themes/tokens.ts";
import { useChatStore } from "@/store/chat.ts";
import { useInference } from "@/store/inference.ts";
import { suspendBackgroundRelease } from "@/services/inference/offload.ts";
import { useModelReady } from "@/hooks/useModelReady.ts";
import { useVoiceCapture } from "@/hooks/useVoiceCapture.ts";
import { asrErrorCopy, hasOpenSettingsAction, OPEN_SETTINGS_LABEL } from "@/services/asr/error-copy.ts";
import { openMicPermissionSettings } from "@/services/voice/mic-access.ts";
import { useAsrStore } from "@/store/asr.ts";
import { MicButton } from "@/components/voice/mic-button.tsx";
import { useSnackbar } from "@/components/snackbar.tsx";
import { VoiceRecordingBar } from "@/components/chat/voice-recording-bar.tsx";
import { useMultimodalAvailable } from "@/hooks/useMultimodalAvailable.ts";
import { cannotSeeKind, type CannotSeeKind } from "@/services/inference/mmproj.ts";
import { useModelStore } from "@/store/model-store";
import { resolveThinking } from "@/services/inference/thinking.ts";
import {
  EFFORT_LABELS,
  EFFORT_LEVELS,
  type EffortLevel,
} from "@/utils/reasoning-capability.ts";
import {
  MAX_IMAGES,
  pickImages,
  type ImageSource,
} from "@/services/chat/attachments.ts";
import { usePressFeedback } from "@/utils/motion.ts";

/** PocketPal's composer field cap (ChatInput styles.ts `maxHeight: 150`):
 *  a long draft scrolls inside the field instead of raising a composer
 *  taller than the reply space the list reserves for it. */
const MAX_FIELD_HEIGHT = 150;

export function MessageInput({
  sending,
  ready,
  onSend,
  className,
  onHeightChange,
  editing,
  onCancelEdit,
  companionName,
  onOpenPicker,
  occlusion,
}: {
  sending: boolean;
  /** False with no loaded model: send disables (PocketPal parity). */
  ready: boolean;
  onSend: (text: string, images?: string[]) => Promise<boolean>;
  /** Where the caller wants this box to sit. The composer floats above the
   *  keyboard, so the chat route passes `absolute inset-x-0 bottom-0`. Note this
   *  component is the chat composer and not a generic input: the keyboard
   *  lift below is unconditional, so a second caller in a sheet or a modal
   *  would be dragged up by the keyboard whether it wanted that or not. It
   *  has one caller today; making that conditional is the price of reusing it. */
  className?: string;
  /** The route's ONE reconciled keyboard-occlusion value (see chat.tsx).
   *  The lift is this box's own animated style over it — there is exactly
   *  one keyboard reader per screen, and it is NOT here. */
  occlusion: SharedValue<number>;
  /** Reports this box's height. The list reserves it with its marginBottom,
   *  so it must be measured here at the outermost level and nowhere
   *  shallower. */
  onHeightChange?: (event: LayoutChangeEvent) => void;
  /** True while the composer is rewriting an earlier turn. */
  editing?: boolean;
  /** Leave edit mode, restoring the composer to the turn's own text. */
  onCancelEdit?: () => void;
  /** The companion bound to this conversation, or null when none is. The
   *  composer only reads it to label the picker; the route owns the state. */
  companionName: string | null;
  /** Open the companion/model picker (PocketPal's composer chevron). */
  onOpenPicker: () => void;
}) {
  const colors = useColors();
  // This box is the bottom-anchored surface, so it carries the keyboard lift
  // itself rather than being wrapped in something that does. The VALUE comes
  // from the caller (the one reconciled occlusion) — this is the same shape
  // pocketpal-ai applies inside ChatView's inputContainerAnimatedStyle.
  const lift = useAnimatedStyle(() => ({
    transform: [{ translateY: -occlusion.value }],
  }));
  // Composer text lives in the chat store (per-session drafts survive
  // switches).
  const draft = useChatStore((s) => s.draft);
  const setDraft = useChatStore((s) => s.setDraft);
  // The engine-accurate gate (matches vision). The attach button starts a
  // turn that needs a live model, so it disables when no model can actually
  // answer.
  const modelReady = useModelReady();
  // G6: the thinking toggle PocketPal keeps in the composer. Local only --
  // `enableThinking` is a llama.rn jinja flag (services/inference//engine.ts),
  // so offering it under a remote API would promise something the remote
  // engine cannot honour.
  const thinkingOverrides = useInference((s) => s.thinkingOverrides);
  const setThinkingOverride = useInference((s) => s.setThinkingOverride);
  const effortOverrides = useInference((s) => s.effortOverrides);
  const setEffortOverride = useInference((s) => s.setEffortOverride);
  const activeModelId = useModelStore((s) => s.activeModelId);
  const activeModels = useModelStore((s) => s.models);
  const activeProviderType = useModelStore((s) => s.activeProviderType);
  const remoteCaps = useModelStore((s) => s.remoteCaps);
  const thinkingLocal =
    activeProviderType === "local";
  // The pill shows the RESOLVED state for the active model — user
  // override, then the spec's detected capability — never a global
  // (C6). Absent capability resolves to UNDEFINED, which is why the
  // pill is gated below rather than rendered for every model.
  const activeSpec = thinkingLocal
    ? activeModels.find((m) => m.id === activeModelId)
    : undefined;
  const resolved = resolveThinking({
    modelId: thinkingLocal ? activeModelId : null,
    reasoning: activeSpec?.reasoning,
    overrides: thinkingOverrides,
  });
  // Undefined means "the model decides" (services/inference//thinking.ts); the
  // pill can only appear where a real value exists, so this is the one
  // case that never renders while undefined.
  const thinkingEnabled = resolved.enabled ?? false;
  // Graded effort for the active model (PocketPal axis-2 parity): armed via
  // the model-settings sheet. Drives the pill's cycle and its label.
  const effortLevel: EffortLevel | null =
    activeModelId === null ? null : (effortOverrides[activeModelId] ?? null);
  const effortArmed = effortLevel !== null;
  // Visibility: a model that KNOWNLY reasons, or one the user already
  // set an override for (nobody loses a control they are using). A model
  // that is known not to reason — and one nobody has classified — gets no
  // pill, because there is no thinking for it to turn off.
  const thinkingSupported =
    thinkingLocal &&
    (activeSpec?.reasoning === true ||
      (activeModelId !== null && thinkingOverrides[activeModelId] !== undefined));
  // Graded effort levels the pill cycles through (PocketPal parity): declared
  // by the model spec when known, otherwise the full canonical set so the pill
  // stays useful for any reasoning model (the turn clamps at send time).
  const declaredLevels = activeSpec?.effortValues ?? [];
  const levels: EffortLevel[] =
    declaredLevels.length > 0
      ? declaredLevels
      : thinkingSupported
        ? [...EFFORT_LEVELS]
        : [];
  const supportsEffort = levels.length > 0;
  // A switch's label names the THING, not the action: VoiceOver reads
  // "label, switch, checked". An imperative label that flipped to
  // "Disable thinking" announced "Disable thinking, switch, on" -- an
  // instruction contradicting the state beside it. The blocked case goes
  // in the hint instead, so the label never moves.
  let thinkingHint: string | undefined;
  if (!modelReady) thinkingHint = "Load a model to use thinking";
  // Graded pill cycle (PocketPal parity): off -> level0 -> ... -> levelN -> off.
  const handleEffortCycle = () => {
    if (activeModelId === null || levels.length === 0) return;
    let nextEnabled: boolean;
    let nextEffort: EffortLevel | null;
    if (!thinkingEnabled) {
      nextEnabled = true;
      nextEffort = levels[0] ?? null;
    } else {
      const idx = effortLevel ? levels.indexOf(effortLevel) : -1;
      if (idx < 0 || idx >= levels.length - 1) {
        nextEnabled = false;
        nextEffort = null;
      } else {
        nextEnabled = true;
        nextEffort = levels[idx + 1] ?? null;
      }
    }
    setThinkingOverride(activeModelId, nextEnabled);
    setEffortOverride(activeModelId, nextEffort);
  };
  const stop = useChatStore((s) => s.stop);
  const [plusOpen, setPlusOpen] = useState(false);
  // Photos attached to the NEXT message (G8: up to MAX_IMAGES). The camera
  // adds one, the gallery several; text stays required — blank messages are
  // rejected before the run.
  const [attached, setAttached] = useState<string[]>([]);
  const [attachIssue, setAttachIssue] = useState<string | null>(null);
  const captureState = useAsrStore((s) => s.captureState);
  const asrError = useAsrStore((s) => s.error);
  const asrAvailable = useAsrStore((s) => s.asrAvailable);
  const resetCapture = useAsrStore((s) => s.resetCapture);
  const { showSnackbar } = useSnackbar();
  const voiceCapture = useVoiceCapture({
    onTranscript: (text) => {
      setDraft(draft === "" ? text : `${draft} ${text}`);
    },
  });
  const isRecording = captureState === "recording";
  const isTranscribing = captureState === "transcribing";
  // D1 (PocketParity): while capturing — recording OR transcribing — the
  // bar REPLACES the whole control row; a capture mid-decode still owns
  // the composer.
  const voiceCaptureActive = isRecording || isTranscribing;
  // D8 (PocketParity): ASR errors surface as a snackbar with the mapped
  // copy, and only a BLOCKED permission gets the Open Settings action.
  useEffect(() => {
    if (asrError === null) return;
    showSnackbar(asrErrorCopy(asrError), {
      type: "error",
      ...(hasOpenSettingsAction(asrError)
        ? {
            action: {
              label: OPEN_SETTINGS_LABEL,
              onPress: () => openMicPermissionSettings(),
            },
          }
        : {}),
    });
  }, [asrError, showSnackbar]);
  // G9 (PocketParity): pressing Send with no model fires a warning haptic
  // and a temporary helper line (ChatInput.tsx:228-240). The button KEEPS
  // its disabled look — only `disabled` is dropped, so the press has
  // something to answer with. Nothing here reverses the keyboard spec §12
  // decision: that argued the PLACEHOLDER is the honest single surface for
  // showing state, and this is feedback for an ATTEMPTED action, not a
  // second place to show state.
  const [helperNote, setHelperNote] = useState<string | null>(null);
  useEffect(() => {
    if (helperNote === null) return;
    const id = setTimeout(() => setHelperNote(null), 2500);
    return () => clearTimeout(id);
  }, [helperNote]);
  useEffect(() => {
    void useInference.getState().load();
  }, []);

  const canSend = ready && !sending && draft.trim() !== "";
  // The placeholder carries the no-model state at all times, because it is the
  // one part of that message which costs no layout: DESIGN.md says placeholder
  // text is "a hint, never a label substitute", and here the hint IS the
  // status. Both strings are pocketpal-ai's, taken verbatim from its locale
  // file (en.json: "modelNotLoaded", "loadingModel") so the two ports do not
  // drift.
  //
  // Gated on `modelReady`, the engine's own selectEngineSource, and NOT on the
  // `ready` prop — see the same note in ChatScreen. `canSend` below still uses
  // `ready`; that split predates this change, but the two must not be confused.
  const downloading = useModelStore((s) =>
    s.models.some((m) => m.downloadStatus === "downloading"),
  );
  const composerPlaceholder = modelReady
    ? "Type a message…"
    : downloading
      ? "Loading model…"
      // One line, not three: the field is ~22 characters wide, so the old
      // "Model not loaded. Please initialize the model." wrapped to three
      // lines and made the EMPTY composer as tall as a paragraph. DESIGN.md
      // (Chat Messages): the placeholder only has to *say so* — the empty
      // thread's card carries the button. "Loading model ..." also matched
      // "Type a message…"'s ellipsis style while it was at it.
      : "Model not loaded.";
  const sendPress = usePressFeedback();
  const stopPress = usePressFeedback();
  const plusPress = usePressFeedback();
  // Capability-gated attach (vision-series 03, PocketPal's
  // isPlusButtonEnabled shape): always rendered, disabled-with-hint when
  // the active model cannot see — no path hands the pipeline an image it
  // would silently strip. Same rule as the send gate, read live.
  const canSee = useMultimodalAvailable();
  // Why the plus is gated, computed from the SAME records cannotSeeKind
  // reads — one verdict per kind, stated in the component because copy is
  // presentation. "sees" never reaches the copy: the only path here runs
  // while !canSee.
  const cannotSee: CannotSeeKind =
    cannotSeeKind({ models: activeModels, remoteCaps, activeModelId, activeProviderType });
  const plusBlockedHint =
    !modelReady
      ? "Load a model to attach a photo."
      : cannotSee === "toggledOff"
        ? "Vision is switched off for this model — turn it on in Models."
        : activeProviderType === "remote"
          ? "This model can't see images."
          : "No vision projector is paired with this model — pair it in Models.";

  async function handleAttach(source: ImageSource): Promise<void> {
    setPlusOpen(false);
    setAttachIssue(null);
    // G14: both the camera and the gallery background the app, so the
    // background-release listener would free the model while the picker is
    // up -- and the send that follows becomes a load-then-fail. Bracket the
    // pick, exactly as pocketpal does (ChatInput.tsx:265-276, :326-349).
    // Android-only symptom: iOS does not report `background` for a picker.
    const resume = suspendBackgroundRelease();
    try {
      const picked = await pickImages(source);
      if (picked.length === 0) {
        setAttachIssue("Couldn't attach that photo — try again.");
        return;
      }
      // Append, and cap here too: picking again is additive, so without
      // this the total would creep past MAX_IMAGES across two picks.
      setAttached((current) => [...current, ...picked].slice(0, MAX_IMAGES));
    } finally {
      resume();
    }
  }

  async function handleSend(): Promise<void> {
    // PocketPal parity (ChatView.tsx:447): sending dismisses the
    // keyboard. The message is committed; the keyboard's job is done,
    // and leaving it up strands the composer over the reply that is
    // about to stream in behind it. KeyboardControllerNative.dismiss is
    // this version's API (1.21.9 exports no `Keyboard` class; that is
    // the newer surface pocketpal-ai is on). keepFocus=false matches
    // Keyboard.dismiss()'s default.
    KeyboardControllerNative.dismiss(false, true);
    // The store clears the draft once the text lives in its bubble.
    await onSend(draft, attached.length > 0 ? attached : undefined);
    setAttached([]);
  }

  return (
    // THE COMPOSER IS THE FIELD. There is no bar behind it and no container
    // around it: this element is the full-bleed docked variant of the field
    // spec (DESIGN.md, "Docked to a screen edge" — Clean White, radius 0, a
    // 1px Hairline top border only, no outer gutter). Nothing wraps it, so
    // there is no second box that can disagree with this one about where the
    // bottom of the screen is.
    //
    // PocketPal-derived structure: container > inputContainer > (issue lines,
    // attach preview, edit bar, textInputArea, controlBar). The issue lines
    // and attach preview are rows the FIELD owns — the measured composer
    // height is exactly what the message list reserves, and the newest
    // message can never sit behind one. Chrome that is not part of the field
    // (the sending indicator, the prompt chips, the usage line) is an
    // overlay in ChatScreen instead.
    <Animated.View
      pointerEvents="box-none"
      className={`border-t border-border bg-surface-1${className ? ` ${className}` : ""}`}
      style={[
        lift,
        {
          shadowColor: "#000000",
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.04,
          shadowRadius: 8,
          elevation: 2,
        },
      ]}
      onLayout={onHeightChange}
    >
      <View className="flex-col">
        {attachIssue !== null && (
          <Text className="px-6 pb-1 font-sans text-xs text-secondary-text">
            {attachIssue}
          </Text>
        )}
        {helperNote !== null && (
          // Same treatment as the other issue lines, so a blocked send
          // does not shout louder than a failed attach.
          <Text
            className="px-6 pb-1 font-sans text-xs text-secondary-text"
            accessibilityLiveRegion="polite"
          >
            {helperNote}
          </Text>
        )}
        {attached.length > 0 && (
          // Mist, not Clean White: this row sits INSIDE the white field now, and
          // the three-plane rule is "a track inside a card is mist on white". It
          // was a white card on the Cool Paper bar before the collapse.
          //
          // Per-image remove, as pocketpal's preview row does. Wrapping rather
          // than a horizontal ScrollView: five thumbs fit in a bounded box, and
          // a nested scroll inside the composer is a fight with the keyboard
          // lift for no gain.
          <View className="mx-6 mb-2 rounded-lg bg-surface-2 p-2">
            <View className="flex-row flex-wrap items-center gap-2">
              {attached.map((uri, i) => (
                <View key={`${i}-${uri.length}`} className="relative">
                  <RNImage source={{ uri }} className="h-14 w-14 rounded" />
                  <Pressable
                    onPress={() => setAttached((c) => c.filter((_, j) => j !== i))}
                    className="absolute -right-2 -top-2 h-12 w-12 items-center justify-center"
                    accessibilityRole="button"
                    accessibilityLabel={`Remove photo ${i + 1} of ${attached.length}`}
                    hitSlop={4}
                  >
                    <View className="h-5 w-5 items-center justify-center rounded-full bg-surface-1">
                      <X size={12} color={colors.primaryText} />
                    </View>
                  </Pressable>
                </View>
              ))}
            </View>
            <Text className="mt-1 font-sans text-xs text-secondary-text">
              {attached.length === 1
                ? "1 photo — sent with your message"
                : `${attached.length} photos — sent with your message`}
            </Text>
          </View>
        )}
        <View className="flex-col">
          {/* IN FLOW, on purpose. The edit bar belongs to the field's state and
              nobody else could own it, so it sits above the control row where
              the measured composer height already counts it — the newest
              message can never be clipped behind it. Putting it in chat.tsx's
              overlay row instead would reserve nothing, but an edit bar the
              user dismisses at will is chrome, and chrome over the list is
              what that row is for. Spec §5. */}
          {editing === true && (
            <View className="flex-row items-center gap-2 border-b border-border px-6 py-1">
              <Pencil size={14} color={colors.secondaryText} />
              <Text className="flex-1 text-quiet">
                Editing message — sending replaces this turn and everything after it
              </Text>
              <Pressable
                onPress={() => onCancelEdit?.()}
                className="icon-btn"
                hitSlop={4}
                accessibilityRole="button"
                accessibilityLabel="Cancel editing"
              >
                <X size={18} color={colors.secondaryText} />
              </Pressable>
            </View>
          )}
          {/* Text input area: the field's own spec supplies the fill, the top
              hairline and the square corners, so this row is padding and the
              input only. maxHeight (PocketPal ChatInput styles.ts) caps the
              field: a long draft scrolls inside it instead of raising a
              composer taller than the message space above it. */}
          <View className="flex-1 px-6 py-2">
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={composerPlaceholder}
              placeholderTextColor={colors.secondaryText}
              multiline
              editable={!sending}
              className="flex-1 pt-2 font-sans text-body-lg text-primary-text"
              style={{
                maxHeight: MAX_FIELD_HEIGHT,
              }}
              accessibilityLabel="Message"
              // The no-model state must not be visual-only: the chip that routes to
              // Models is focus-gated, and a screen reader announces a field's label
              // rather than its placeholder, so a fixed "Message" label would hide
              // the only always-present statement that the composer is blocked.
              accessibilityHint={modelReady ? undefined : composerPlaceholder}
            />
          </View>
          {/* Control bar: while a voice capture records or transcribes, the
              whole row IS the VoiceRecordingBar (D1/D2/D3/D10 — its cancel,
              waveform, timer, stop and language chip). No capture: left
              controls (attach, companion/model picker), right controls
              (thinking, mic, send/stop) — PocketPal's split. The mic GATE
              (D5): hidden when the availability gate is shut; a gate that is
              open without an installed tier routes to the Voice settings
              screen (PocketParity mic-button-setup). */}
          {voiceCaptureActive ? (
            <VoiceRecordingBar
              onCancel={() => {
                voiceCapture.cancel();
                resetCapture();
              }}
              onStop={() => voiceCapture.stop()}
            />
          ) : (
          <View className="flex-row items-center justify-between px-6 py-2 min-h-9">
            <View className="flex-row items-center gap-2 flex-1">
              <Animated.View style={plusPress.animatedStyle}>
                <Pressable
                  // G9's rule for attach: a gated plus must still ANSWER the
                  // press. The look stays disabled (secondary glyph, disabled
                  // a11y state), but the press explains itself with a helper
                  // line naming THE reason — no model, vision toggled off, or
                  // no projector paired (cannotSeeKind reads the same records
                  // the send gate does, so the two cannot split).
                  onPress={
                    modelReady && canSee
                      ? () => setPlusOpen((o) => !o)
                      : () => {
                          void Haptics.notificationAsync(
                            Haptics.NotificationFeedbackType.Warning,
                          );
                          setHelperNote(plusBlockedHint);
                        }
                  }
                  onPressIn={plusPress.onPressIn}
                  onPressOut={plusPress.onPressOut}
                  className="h-12 w-12 items-center justify-center rounded-full bg-surface-3"
                  style={{
                    shadowColor: "#000000",
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.04,
                    shadowRadius: 4,
                    elevation: 1,
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !modelReady || !canSee }}
                  accessibilityLabel={
                    modelReady && canSee
                      ? "Attach a photo"
                      : modelReady
                        ? "This model can't see images"
                        : "Load a model to attach a photo"
                  }
                >
                  <Plus size={20} color={modelReady && canSee ? colors.primary : colors.secondaryText} />
                </Pressable>
              </Animated.View>
              {/* PocketPal's pal selector (ChatInput.tsx): a chevron that
                  opens the tabbed companion/model sheet, labelled with the
                  active companion's name when one is bound. The label only
                  appears with an active model, as PocketPal's does. */}
              <Pressable
                onPress={onOpenPicker}
                testID="chat-picker-button"
                className="h-12 shrink flex-row items-center gap-1"
                accessibilityRole="button"
                accessibilityLabel={
                  companionName === null
                    ? "Choose companion and model"
                    : `Choose companion and model, current ${companionName}`
                }
              >
                <View
                  className="h-12 w-12 items-center justify-center rounded-full bg-surface-3"
                  style={{
                    shadowColor: "#000000",
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.04,
                    shadowRadius: 4,
                    elevation: 1,
                  }}
                >
                  <ChevronUp size={20} color={colors.primary} />
                </View>
                {activeModelId !== null && !!companionName && (
                  <Text numberOfLines={1} className="shrink text-quiet">
                    Companion:{" "}
                    <Text className="font-sans-semibold">{companionName}</Text>
                  </Text>
                )}
              </Pressable>
              {plusOpen && (
                // Anchored to the plus button's wrapper and extending right into
                // the empty composer space — the plus is leftmost, so w-48 fits
                // without clipping. (right-0 here would squash it to 48px.)
                <View
                  className="surface bg-surface-1 absolute bottom-12 left-0 w-48 py-1"
                  style={{
                    shadowColor: "#000000",
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.08,
                    shadowRadius: 12,
                    elevation: 4,
                  }}
                >
                  <PlusItem
                    Icon={Camera}
                    label="Take photo"
                    onPress={() => void handleAttach("camera")}
                  />
                  <PlusItem
                    Icon={ImageIcon}
                    label="Choose from gallery"
                    onPress={() => void handleAttach("gallery")}
                  />
                </View>
              )}
            </View>
            <View className="flex-row items-center gap-2">
              {thinkingSupported && (
                // PocketPal's composer pill (ChatInput.tsx:588-640). State is
                // carried by the fill AND the icon, per DESIGN.md's "pair every
                // status colour with a glyph and a word" rule -- so it never
                // depends on colour alone.
                //
                // Graded models (axis-2) cycle off -> level0 -> ... -> levelN ->
                // off on a single press; effort-less models just toggle on/off.
                // The label shows the current effort when graded and on.
                <Pressable
                  onPress={
                    modelReady && activeModelId !== null
                      ? supportsEffort
                        ? handleEffortCycle
                        : () => {
                            setThinkingOverride(activeModelId, !resolved.enabled);
                          }
                      : undefined
                  }
                  disabled={!modelReady}
                  className={
                    thinkingEnabled
                      ? "h-12 flex-row items-center gap-1.5 rounded-full bg-surface-2 pl-3.5 pr-3.5"
                      : "h-12 flex-row items-center gap-1.5 rounded-full bg-surface-3 pl-3.5 pr-3.5"
                  }
                  accessibilityRole={supportsEffort ? "button" : "switch"}
                  accessibilityState={
                    supportsEffort
                      ? { disabled: !modelReady }
                      : { checked: thinkingEnabled, disabled: !modelReady }
                  }
                  accessibilityLabel={
                    supportsEffort && thinkingEnabled && effortLevel
                      ? `Thinking effort: ${EFFORT_LABELS[effortLevel]}`
                      : "Thinking"
                  }
                  accessibilityHint={thinkingHint}
                >
                  <Brain
                    size={16}
                    color={thinkingEnabled ? colors.primary : colors.secondaryText}
                  />
                  <Text
                    className={
                      thinkingEnabled
                        ? "font-sans text-caption text-primary-text"
                        : "text-quiet"
                    }
                  >
                    {supportsEffort && thinkingEnabled && effortLevel
                      ? EFFORT_LABELS[effortLevel]
                      : "Think"}
                  </Text>
                </Pressable>
              )}
              {/* Mic sits beside Send, as pocketpal's ChatInput does
                  (`styles.micBeforeSend`): the two things that finish a turn
                  are adjacent, and the leading slot belongs to attachment
                  and the companion/model picker. Self-gating: gates, setup
                  sheet and testIDs live in the component. */}
              {asrAvailable && (
                <MicButton
                  onStart={() =>
                    isRecording ? voiceCapture.stop() : voiceCapture.start()
                  }
                />
              )}
              {/* Send and Stop are siblings, never nested: two nested pressables
                  would be two hit targets and two a11y roles on one control.
                  Send: Primary (Signal Blue fill) when armed, Disabled (Mist) when
                  not — a disabled send is a fill change, not an opacity drop. */}
              {sending ? (
                <Animated.View style={stopPress.animatedStyle}>
                  <Pressable
                    onPress={stop}
                    onPressIn={stopPress.onPressIn}
                    onPressOut={stopPress.onPressOut}
                    className="h-12 w-12 items-center justify-center rounded-full bg-primary"
                    style={{
                      shadowColor: "#000000",
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.06,
                      shadowRadius: 6,
                      elevation: 2,
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Stop generating"
                  >
                    <Square size={18} color={colors.onPrimary} />
                  </Pressable>
                </Animated.View>
              ) : (
                <Animated.View style={sendPress.animatedStyle}>
                  <Pressable
                    // Only an EMPTY draft is truly inert. A non-empty draft with
                    // no model must still answer the press -- that answer is the
                    // whole point of G9.
                    disabled={draft.trim() === ""}
                    onPress={() => {
                      if (!modelReady) {
                        void Haptics.notificationAsync(
                          Haptics.NotificationFeedbackType.Warning,
                        );
                        setHelperNote("Load a model to send this message.");
                        return;
                      }
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      void handleSend();
                    }}
                    onPressIn={sendPress.onPressIn}
                    onPressOut={sendPress.onPressOut}
                    className={`h-12 w-12 items-center justify-center rounded-full ${
                      canSend ? "bg-primary" : "bg-surface-2"
                    }`}
                    style={
                      canSend
                        ? {
                            shadowColor: "#000000",
                            shadowOffset: { width: 0, height: 1 },
                            shadowOpacity: 0.06,
                            shadowRadius: 6,
                            elevation: 2,
                          }
                        : undefined
                    }
                    accessibilityRole="button"
                    accessibilityLabel={
                      modelReady ? "Send message" : "Load a model to send this message"
                    }
                  >
                    <Send size={20} color={canSend ? colors.onPrimary : colors.secondaryText} />
                  </Pressable>
                </Animated.View>
              )}
            </View>
          </View>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

function PlusItem({
  Icon,
  label,
  onPress,
}: {
  Icon: LucideIcon;
  label: string;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 px-5 py-2"
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Icon size={18} color={colors.primary} />
      <Text className="font-sans text-body-sm text-primary-text">{label}</Text>
    </Pressable>
  );
}
