/** Chat composer: text input + dictation + vision/voice shortcuts.
 *
 * Moved from components/InteractionPanel.tsx (Wave 1 chat): same behavior,
 * new home. The composer mic dictates into the draft (you press Send); the
 * Voice tab opens the standalone /voice hands-free screen, and the Vision
 * entry opens the standalone /vision camera screen.
 */

import { useEffect, useRef, useState } from "react";
import { Image as RNImage, Pressable, Text, TextInput, View } from "react-native";
import { useIsFocused } from "expo-router";
import { openSettings } from "expo-linking";
import { Camera, Image as ImageIcon, Mic, Plus, Send, Square, X, type LucideIcon } from "lucide-react-native";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";

import { colors } from "../../themes/tokens.ts";
import { useChatStore } from "../../store/chat.ts";
import { useInference } from "../../store/inference.ts";
import { useModelReady } from "../../hooks/useModelReady.ts";
import { mergeDictation, VOICE_LISTEN_OPTS } from "../../lib/voiceListen.ts";
import { ensureMicAccess } from "../../lib/micAccess.ts";
import { isThrottlingError, isVoiceThrottled, setVoiceThrottled } from "../../lib/voiceStatus.ts";
import { pickImage, type ImageSource } from "../../lib/chat/attachments.ts";

export function ChatInput({
  sending,
  ready,
  onSend,
}: {
  sending: boolean;
  /** False with no loaded model: send disables (PocketPal parity). */
  ready: boolean;
  onSend: (text: string, image?: string) => Promise<boolean>;
}) {
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
    // One owner for the gutter: the wrapper. Children stack no inset of
    // their own (DESIGN.md "Gutters are owned by one layer").
    <View className="border-t border-border bg-base px-5 pt-2">
      {voiceIssue !== null &&
        (voiceSettings ? (
          <Pressable onPress={() => void openSettings()}>
            <Text className="pb-1 font-sans text-body-sm text-primary">
              {voiceIssue}
            </Text>
          </Pressable>
        ) : (
          <Text className="pb-1 font-sans text-body-sm text-secondary-text">
            {voiceIssue}
          </Text>
        ))}
      {attachIssue !== null && (
        <Text className="pb-1 font-sans text-body-sm text-secondary-text">
          {attachIssue}
        </Text>
      )}
      {attached !== null && (
        <View className="mb-2 flex-row items-center gap-2 rounded-lg border border-border bg-surface-1 p-2">
          <RNImage source={{ uri: attached }} className="h-14 w-14 rounded" />
          <Text className="flex-1 font-sans text-body-sm text-secondary-text">
            Attached — sent with your message
          </Text>
          <Pressable
            onPress={() => setAttached(null)}
            className="h-12 w-12 items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel="Remove attachment"
          >
            <X size={18} color={colors.secondaryText} />
          </Pressable>
        </View>
      )}
      {/* The composer is an input, not a custom control (DESIGN.md): the
          field spec — Clean White, 1px Hairline, 8px radius, 12/16 padding —
          with a leading attach control and a trailing send icon button in
          its Primary state. Disabled send is Secondary, never dimmed. */}
      <View className="mb-3 flex-row items-end gap-2 rounded-lg border border-border bg-surface-1 px-4 py-3">
        <View>
          <Pressable
            onPress={modelReady ? () => setPlusOpen((o) => !o) : undefined}
            disabled={!modelReady}
            className="h-12 w-12 items-center justify-center rounded-full bg-surface-3"
            accessibilityRole="button"
            accessibilityState={{ disabled: !modelReady }}
            accessibilityLabel={modelReady ? "Attach a photo" : "Load a model to attach a photo"}
          >
            <Plus size={20} color={modelReady ? colors.primary : colors.secondaryText} />
          </Pressable>
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
          placeholder="Type a message…"
          placeholderTextColor={colors.secondaryText}
          multiline
          editable={!sending}
          onSubmitEditing={() => void handleSend()}
          className="flex-1 pt-2 font-sans text-body-md text-primary-text"
          accessibilityLabel="Message"
        />
        <View className="flex-row items-center gap-1">
          <Pressable
            onPress={modelReady ? () => void toggleDictation() : undefined}
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
        </View>
        {/* Send and Stop are siblings, never nested: two nested pressables
            would be two hit targets and two a11y roles on one control.
            Send: Primary (Signal Blue fill) when armed, Disabled (Mist) when
            not — a disabled send is a fill change, not an opacity drop. */}
        {sending ? (
          <Pressable
            onPress={stop}
            className="h-12 w-12 items-center justify-center rounded-full bg-primary"
            accessibilityRole="button"
            accessibilityLabel="Stop generating"
          >
            <Square size={18} color={colors.onPrimary} />
          </Pressable>
        ) : (
          <Pressable
            disabled={!canSend}
            onPress={() => void handleSend()}
            className={`h-12 w-12 items-center justify-center rounded-full ${
              canSend ? "bg-primary" : "bg-surface-2"
            }`}
            accessibilityRole="button"
            accessibilityLabel="Send message"
          >
            <Send size={20} color={canSend ? colors.onPrimary : colors.secondaryText} />
          </Pressable>
        )}
      </View>
    </View>
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
      <Text className="font-sans text-body-md text-primary-text">{label}</Text>
    </Pressable>
  );
}
