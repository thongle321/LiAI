/** Message input: the composer — text field + dictation + vision/voice
 * shortcuts.
 *
 * Renamed from ChatInput.tsx (message-view refactor): same behavior, new
 * name. The composer mic dictates into the draft (you press Send); the
 * Voice tab opens the standalone /voice hands-free screen, and the Vision
 * entry opens the standalone /vision camera screen.
 */

import { useEffect, useRef, useState } from "react";
import {
  Image as RNImage,
  Pressable,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { useIsFocused } from "expo-router";
import { openSettings } from "expo-linking";
import { Brain, Camera, Image as ImageIcon, Mic, Pencil, Plus, Send, Square, X, type LucideIcon } from "lucide-react-native";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import Animated from "react-native-reanimated";

import * as Haptics from "expo-haptics";

import { colors } from "../../themes/tokens.ts";
import { useChatStore } from "../../store/chat.ts";
import { useInference } from "../../store/inference.ts";
import { suspendBackgroundRelease } from "../../lib/inference/offload.ts";
import { useModelReady } from "../../hooks/useModelReady.ts";
import { useMultimodalAvailable } from "../../hooks/useMultimodalAvailable.ts";
import { useModelStore } from "../../store/modelStore";
import { resolveThinking } from "../../lib/inference/thinking.ts";
import { mergeDictation, VOICE_LISTEN_OPTS } from "../../lib/voiceListen.ts";
import { ensureMicAccess } from "../../lib/micAccess.ts";
import { isThrottlingError, isVoiceThrottled, setVoiceThrottled } from "../../lib/voiceStatus.ts";
import {
  MAX_IMAGES,
  pickImages,
  type ImageSource,
} from "../../lib/chat/attachments.ts";
import { usePressFeedback } from "../../lib/motion.ts";
import { useKeyboardLift } from "../../hooks/useKeyboardLift.ts";

export function MessageInput({
  sending,
  ready,
  onSend,
  className,
  onHeightChange,
  editing,
  onCancelEdit,
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
  /** Reports this box's height. It is the only thing reserving room for a
   *  composer that is out of flow, so it must be measured here at the
   *  outermost level and nowhere shallower. */
  onHeightChange?: (event: LayoutChangeEvent) => void;
  /** True while the composer is rewriting an earlier turn. */
  editing?: boolean;
  /** Leave edit mode, restoring the composer to the turn's own text. */
  onCancelEdit?: () => void;
}) {
  // This box is the bottom-anchored surface, so it carries the keyboard lift
  // itself rather than being wrapped in something that does. Same mechanism
  // the library applies internally (`translateY: height.value + offset` in
  // KeyboardStickyView), minus the extra component.
  const lift = useKeyboardLift();
  // Composer text lives in the chat store (per-session drafts survive
  // switches); dictation mechanics stay local below.
  const draft = useChatStore((s) => s.draft);
  const setDraft = useChatStore((s) => s.setDraft);
  // The engine-accurate gate (matches voice/vision). The mic and the attach
  // button both start a turn that needs a live model, so they disable when
  // no model can actually answer.
  const modelReady = useModelReady();
  // G6: the thinking toggle PocketPal keeps in the composer. Local only --
  // `enableThinking` is a llama.rn jinja flag (lib/inference/engine.ts),
  // so offering it under a remote API would promise something the remote
  // engine cannot honour.
  const thinkingOverrides = useInference((s) => s.thinkingOverrides);
  const setThinkingOverride = useInference((s) => s.setThinkingOverride);
  const activeModelId = useModelStore((s) => s.activeModelId);
  const activeModels = useModelStore((s) => s.models);
  const thinkingLocal =
    useModelStore((s) => s.activeProviderType) === "local";
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
  // Undefined means "the model decides" (lib/inference/thinking.ts); the
  // pill can only appear where a real value exists, so this is the one
  // case that never renders while undefined.
  const thinkingEnabled = resolved.enabled ?? false;
  // Visibility: a model that KNOWNLY reasons, or one the user already
  // set an override for (nobody loses a control they are using). A model
  // that is known not to reason — and one nobody has classified — gets no
  // pill, because there is no thinking for it to turn off.
  const thinkingSupported =
    thinkingLocal &&
    (activeSpec?.reasoning === true ||
      (activeModelId !== null && thinkingOverrides[activeModelId] !== undefined));
  // A switch's label names the THING, not the action: VoiceOver reads
  // "label, switch, checked". An imperative label that flipped to
  // "Disable thinking" announced "Disable thinking, switch, on" -- an
  // instruction contradicting the state beside it. The blocked case goes
  // in the hint instead, so the label never moves.
  let thinkingHint: string | undefined;
  if (!modelReady) thinkingHint = "Load a model to use thinking";
  const stop = useChatStore((s) => s.stop);
  const [plusOpen, setPlusOpen] = useState(false);
  // Photos attached to the NEXT message (G8: up to MAX_IMAGES). The camera
  // adds one, the gallery several; text stays required — blank messages are
  // rejected before the run.
  const [attached, setAttached] = useState<string[]>([]);
  const [attachIssue, setAttachIssue] = useState<string | null>(null);
  // G9 (PocketParity): pressing Send with no model fires a warning haptic
  // and a temporary helper line (ChatInput.tsx:228-240). The button KEEPS
  // its disabled look — only `disabled` is dropped, so the press has
  // something to answer with. Nothing here reverses the keyboard spec §12
  // decision: that argued the PLACEHOLDER is the honest single surface for
  // showing state, and this is feedback for an ATTEMPTED action, not a
  // second place to show state.
  const [blockedNote, setBlockedNote] = useState<string | null>(null);
  useEffect(() => {
    if (blockedNote === null) return;
    const id = setTimeout(() => setBlockedNote(null), 2500);
    return () => clearTimeout(id);
  }, [blockedNote]);
  // Dictation: mic fills the draft, the user presses Send. Interim
  // updates replace the dictated tail (draftBase keeps typed text).
  const [listening, setListening] = useState(false);
  const [voiceIssue, setVoiceIssue] = useState<string | null>(null);
  // Permanent denial never pops the OS dialog again — the issue
  // line becomes a link into Settings instead of dead text.
  const [voiceSettings, setVoiceSettings] = useState(false);
  const draftBase = useRef("");
  // The stack keeps chat mounted under /voice: ignore recognizer
  // events while unfocused, or both screens process every event.
  const focused = useIsFocused();
  const focusedRef = useRef(focused);
  focusedRef.current = focused;
  // Fast double-taps would start() twice; the second errors busy.
  const startingRef = useRef(false);

  // ponytail: the native module is absent when the dev build predates
  // the dep — stop() then throws, so never let it take down the caller.
  function safeStopDictation(): void {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      // nothing live to stop
    }
  }

  async function toggleDictation(): Promise<void> {
    // Shared lockout (voice tab sets it too): restarts extend the ban.
    if (isVoiceThrottled()) {
      setVoiceSettings(false);
      setVoiceIssue("Too many voice requests — wait a bit and try again.");
      return;
    }
    if (listening) {
      safeStopDictation();
      return;
    }
    if (startingRef.current) return;
    startingRef.current = true;
    try {
      // Popup shows only when undetermined; a permanent denial must
      // go through Settings, and a stale build has nothing to ask.
      const access = await ensureMicAccess();
      if (access === "unavailable") {
        setVoiceSettings(false);
        setVoiceIssue("Voice input isn't available in this build — rebuild the dev client.");
        return;
      }
      if (access === "settings") {
        setVoiceSettings(true);
        setVoiceIssue("Microphone is blocked — tap here to open Settings and enable it.");
        return;
      }
      setVoiceSettings(false);
      draftBase.current = draft;
      setVoiceIssue(null);
      ExpoSpeechRecognitionModule.start({
        ...VOICE_LISTEN_OPTS,
      });
    } catch {
      setVoiceIssue("Voice input isn't available in this build — rebuild the dev client.");
    } finally {
      startingRef.current = false;
    }
  }

  useSpeechRecognitionEvent("start", () => {
    if (focusedRef.current) setListening(true);
  });
  useSpeechRecognitionEvent("end", () => {
    if (focusedRef.current) setListening(false);
  });
  useSpeechRecognitionEvent("result", (event) => {
    if (!focusedRef.current) return;
    const text = event.results[0]?.transcript ?? "";
    if (text === "") return;
    setDraft(mergeDictation(draftBase.current, text));
  });
  useSpeechRecognitionEvent("nomatch", () => {
    if (!focusedRef.current) return;
    console.warn("[voice] dictation failure: nomatch");
    setVoiceIssue("I didn't catch that — try again.");
  });
  useSpeechRecognitionEvent("error", (event) => {
    if (event.error === "aborted") return; // our own stop()
    if (!focusedRef.current) return;
    // The raw code goes to the terminal; the user gets clean copy (Q3).
    console.warn(`[voice] dictation failure: ${event.error} ${event.message ?? ""}`);
    if (isThrottlingError(event.error)) {
      setVoiceThrottled();
      setVoiceIssue("Too many voice requests — wait a bit and try again.");
      return;
    }
    setVoiceIssue(
      event.error === "not-allowed"
        ? "Microphone access is needed."
        : "I didn't catch that — try again.",
    );
  });

  useEffect(() => {
    void useInference.getState().load();
    return () => {
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {
        // shutting down anyway
      }
    };
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
  const micPress = usePressFeedback();
  const plusPress = usePressFeedback();
  // Capability-gated attach (vision-series 03, PocketPal's
  // isPlusButtonEnabled shape): always rendered, disabled-with-hint when
  // the active model cannot see — no path hands the pipeline an image it
  // would silently strip. Same rule as the send gate, read live.
  const canSee = useMultimodalAvailable();

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
    // Spurious stop() with nothing live confuses the native session;
    // only stop an active dictate before sending.
    if (listening) safeStopDictation();
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
    // Everything stacked above the control row is a row the FIELD owns — the
    // issue lines and the attach preview — so this box's measured height is
    // exactly what the message list reserves, and the newest message can never
    // sit behind one. Chrome that is not part of the field (the sending
    // indicator, the prompt chips, the usage line) is an overlay in ChatScreen
    // instead, and needs no reservation because it is positioned over the list,
    // not in this flow.
    <Animated.View
      className={`border-t border-border bg-surface-1${className ? ` ${className}` : ""}`}
      style={lift}
      onLayout={onHeightChange}
    >
      {voiceIssue !== null &&
        (voiceSettings ? (
          // A whole row is the target, not the 16px of text: DESIGN.md's
          // floor is 48×48dp, and the padding goes on the hit area, never on
          // the text.
          <Pressable
            onPress={() => void openSettings()}
            className="min-h-12 justify-center"
            accessibilityRole="button"
            accessibilityLabel="Open voice settings"
          >
            <Text className="px-4 font-sans text-xs text-primary">
              {voiceIssue}
            </Text>
          </Pressable>
        ) : (
          <Text className="px-4 pb-1 font-sans text-xs text-secondary-text">
            {voiceIssue}
          </Text>
        ))}
          {attachIssue !== null && (
        <Text className="px-4 pb-1 font-sans text-xs text-secondary-text">
          {attachIssue}
        </Text>
      )}
      {blockedNote !== null && (
        // Same treatment as the other issue lines, so a blocked send
        // does not shout louder than a failed attach.
        <Text
          className="px-4 pb-1 font-sans text-xs text-secondary-text"
          accessibilityLiveRegion="polite"
        >
          {blockedNote}
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
        <View className="mx-4 mb-2 rounded-lg bg-surface-2 p-2">
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
          {/* IN FLOW, on purpose. The edit bar belongs to the field's state and
        nobody else could own it, so it sits above the control row where
        the measured composer height already counts it — the newest
        message can never be clipped behind it. Putting it in chat.tsx's
        overlay row instead would reserve nothing, but an edit bar the
        user dismisses at will is chrome, and chrome over the list is
        what that row is for. Spec §5. */}
      {editing === true && (
        <View className="flex-row items-center gap-2 border-b border-border px-4 py-1">
          <Pencil size={14} color={colors.secondaryText} />
          <Text className="flex-1 font-sans text-body-sm text-secondary-text">
            Editing message — sending replaces this turn and everything after it
          </Text>
          <Pressable
            onPress={() => onCancelEdit?.()}
            className="h-12 w-12 items-center justify-center"
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel="Cancel editing"
          >
            <X size={18} color={colors.secondaryText} />
          </Pressable>
        </View>
      )}
      {/* The control row. The field's own spec supplies the fill, the top
    hairline and the square corners, so this row is padding and
    controls only: no radius, no border, no background, and no bottom
    margin — it is flush with the bottom of the screen. */}
      <View className="flex-row items-end gap-2 px-4 py-3">
        <View>
          <Animated.View style={plusPress.animatedStyle}>
            <Pressable
              onPress={modelReady && canSee ? () => setPlusOpen((o) => !o) : undefined}
              onPressIn={plusPress.onPressIn}
              onPressOut={plusPress.onPressOut}
              disabled={!modelReady || !canSee}
              className="h-12 w-12 items-center justify-center rounded-full bg-surface-3"
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
          {plusOpen && (
            // Anchored to the plus button's wrapper and extending right into
            // the empty composer space — the plus is leftmost, so w-48 fits
            // without clipping. (right-0 here would squash it to 48px.)
            <View className="absolute bottom-12 left-0 w-48 rounded-lg border border-border bg-surface-1 py-1">
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
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={composerPlaceholder}
          placeholderTextColor={colors.secondaryText}
          multiline
          editable={!sending}
          className="flex-1 pt-2 font-sans text-body-lg text-primary-text"
          accessibilityLabel="Message"
        // The no-model state must not be visual-only: the chip that routes to
        // Models is focus-gated, and a screen reader announces a field's label
        // rather than its placeholder, so a fixed "Message" label would hide
        // the only always-present statement that the composer is blocked.
        accessibilityHint={modelReady ? undefined : composerPlaceholder}
        />
        <View className="flex-row items-center gap-2">
          {thinkingSupported && (
            // PocketPal's composer pill (ChatInput.tsx:588-640). State is
            // carried by the fill AND the icon, per DESIGN.md's "pair every
            // status colour with a glyph and a word" rule -- so it never
            // depends on colour alone.
            //
            // NO effort cycle. PocketPal's pill double-taps through graded
            // reasoning effort; LiAI has no effort concept anywhere, and
            // inventing levels here would ship a control with nothing
            // behind it.
            <Pressable
              onPress={
                modelReady && activeModelId !== null
                  ? () => {
                      // A press is a PER-MODEL decision, both directions.
                      // There is no global fallback any more: an
                      // unclassified model sends no flag at all, so the
                      // template decides (lib/inference/thinking.ts).
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
              accessibilityRole="switch"
              accessibilityState={{ checked: thinkingEnabled, disabled: !modelReady }}
              accessibilityLabel="Thinking"
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
                    : "font-sans text-caption text-secondary-text"
                }
              >
                Think
              </Text>
            </Pressable>
          )}
          <Animated.View style={micPress.animatedStyle}>
            <Pressable
              onPress={modelReady ? () => void toggleDictation() : undefined}
              onPressIn={micPress.onPressIn}
              onPressOut={micPress.onPressOut}
              disabled={!modelReady}
              className="h-12 w-12 items-center justify-center rounded-full bg-surface-2"
              accessibilityRole="button"
              accessibilityState={{ disabled: !modelReady }}
              accessibilityLabel={
                !modelReady ? "Load a model to dictate" : listening ? "Stop dictation" : "Dictate a message"
              }
            >
              <Mic size={20} color={modelReady ? (listening ? colors.primary : colors.secondaryText) : colors.secondaryText} />
            </Pressable>
          </Animated.View>
        </View>
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
                  setBlockedNote("Load a model to send this message.");
                  return;
                }
                void handleSend();
              }}
              onPressIn={sendPress.onPressIn}
              onPressOut={sendPress.onPressOut}
              className={`h-12 w-12 items-center justify-center rounded-full ${
                canSend ? "bg-primary" : "bg-surface-2"
              }`}
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
  return (
    <Pressable onPress={onPress} className="flex-row items-center gap-3 px-5 py-2">
      <Icon size={18} color={colors.primary} />
      <Text className="font-sans text-body-sm text-primary-text">{label}</Text>
    </Pressable>
  );
}
