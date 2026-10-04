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
import { Camera, Image as ImageIcon, Mic, Pencil, Plus, Send, Square, X, type LucideIcon } from "lucide-react-native";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import Animated from "react-native-reanimated";

import { colors } from "../../themes/tokens.ts";
import { useChatStore } from "../../store/chat.ts";
import { useInference } from "../../store/inference.ts";
import { useModelReady } from "../../hooks/useModelReady.ts";
import { useModelStore } from "../../store/modelStore";
import { mergeDictation, VOICE_LISTEN_OPTS } from "../../lib/voiceListen.ts";
import { ensureMicAccess } from "../../lib/micAccess.ts";
import { isThrottlingError, isVoiceThrottled, setVoiceThrottled } from "../../lib/voiceStatus.ts";
import { pickImage, type ImageSource } from "../../lib/chat/attachments.ts";
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
  onSend: (text: string, image?: string) => Promise<boolean>;
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
  const stop = useChatStore((s) => s.stop);
  const [plusOpen, setPlusOpen] = useState(false);
  // One attached photo per turn (the local turn takes a single data-uri);
  // text stays required — blank messages are rejected before the run.
  const [attached, setAttached] = useState<string | null>(null);
  const [attachIssue, setAttachIssue] = useState<string | null>(null);
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

  async function handleAttach(source: ImageSource): Promise<void> {
    setPlusOpen(false);
    setAttachIssue(null);
    const uri = await pickImage(source);
    if (uri === null) {
      setAttachIssue("Couldn't attach that photo — try again.");
      return;
    }
    setAttached(uri);
  }

  async function handleSend(): Promise<void> {
    // Spurious stop() with nothing live confuses the native session;
    // only stop an active dictate before sending.
    if (listening) safeStopDictation();
    // The store clears the draft once the text lives in its bubble.
    await onSend(draft, attached ?? undefined);
    setAttached(null);
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
      {attached !== null && (
        // Mist, not Clean White: this row sits INSIDE the white field now, and
        // the three-plane rule is "a track inside a card is mist on white". It
        // was a white card on the Cool Paper bar before the collapse.
        <View className="mx-4 mb-2 flex-row items-center gap-2 rounded-lg bg-surface-2 p-2">
          <RNImage source={{ uri: attached }} className="h-14 w-14 rounded" />
          <Text className="flex-1 font-sans text-xs text-secondary-text">
            Attached — sent with your message
          </Text>
          <Animated.View style={plusPress.animatedStyle}>
            <Pressable
              onPress={() => setAttached(null)}
              onPressIn={plusPress.onPressIn}
              onPressOut={plusPress.onPressOut}
              className="h-12 w-12 items-center justify-center"
              accessibilityRole="button"
              accessibilityLabel="Remove attachment"
            >
              <X size={18} color={colors.secondaryText} />
            </Pressable>
          </Animated.View>
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
              onPress={modelReady ? () => setPlusOpen((o) => !o) : undefined}
              onPressIn={plusPress.onPressIn}
              onPressOut={plusPress.onPressOut}
              disabled={!modelReady}
              className="h-12 w-12 items-center justify-center rounded-full bg-surface-3"
              accessibilityRole="button"
              accessibilityState={{ disabled: !modelReady }}
              accessibilityLabel={modelReady ? "Attach a photo" : "Load a model to attach a photo"}
            >
              <Plus size={20} color={modelReady ? colors.primary : colors.secondaryText} />
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
              disabled={!canSend}
              onPress={() => void handleSend()}
              onPressIn={sendPress.onPressIn}
              onPressOut={sendPress.onPressOut}
              className={`h-12 w-12 items-center justify-center rounded-full ${
                canSend ? "bg-primary" : "bg-surface-2"
              }`}
              accessibilityRole="button"
              accessibilityLabel="Send message"
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
