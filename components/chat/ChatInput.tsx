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
import { Camera, Image as ImageIcon, Mic, Plus, Send, X, type LucideIcon } from "lucide-react-native";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";

import { colors } from "../../themes/tokens.ts";
import { useChatStore } from "../../store/chat.ts";
import { mergeDictation, VOICE_LISTEN_OPTS } from "../../lib/voiceListen.ts";
import { ensureMicAccess } from "../../lib/micAccess.ts";
import { isThrottlingError, isVoiceThrottled, setVoiceThrottled } from "../../lib/voiceStatus.ts";
import { pickImage, type ImageSource } from "../../lib/chat/attachments.ts";

export function ChatInput({
  sending,
  onSend,
}: {
  sending: boolean;
  onSend: (text: string, image?: string) => Promise<boolean>;
}) {
  // Composer text lives in the chat store (per-session drafts survive
  // switches); dictation mechanics stay local below.
  const draft = useChatStore((s) => s.draft);
  const setDraft = useChatStore((s) => s.setDraft);
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
    setVoiceIssue("Didn't catch that (nomatch).");
  });
  useSpeechRecognitionEvent("error", (event) => {
    if (event.error === "aborted") return; // our own stop()
    if (!focusedRef.current) return;
    // Name the code on screen + terminal: the generic line hid the cause.
    console.warn(`[voice] dictation failure: ${event.error} ${event.message ?? ""}`);
    if (isThrottlingError(event.error)) {
      setVoiceThrottled();
      setVoiceIssue("Too many voice requests — wait a bit and try again.");
      return;
    }
    setVoiceIssue(
      event.error === "not-allowed"
        ? "Microphone access is needed."
        : `Didn't catch that (${event.error}).`,
    );
  });

  useEffect(() => {
    return () => {
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {
        // shutting down anyway
      }
    };
  }, []);

  const canSend = !sending && draft.trim() !== "";

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
    <View className="border-t border-border bg-base">
      {voiceIssue !== null &&
        (voiceSettings ? (
          <Pressable onPress={() => void openSettings()}>
            <Text className="px-5 pb-1 font-sans text-body-sm text-primary">
              {voiceIssue}
            </Text>
          </Pressable>
        ) : (
          <Text className="px-5 pb-1 font-sans text-body-sm text-secondary-text">
            {voiceIssue}
          </Text>
        ))}
      {attachIssue !== null && (
        <Text className="px-5 pb-1 font-sans text-body-sm text-secondary-text">
          {attachIssue}
        </Text>
      )}
      {attached !== null && (
        <View className="mx-4 mb-2 flex-row items-center gap-2 rounded-card border border-border bg-surface-1 p-2">
          <RNImage source={{ uri: attached }} className="h-14 w-14 rounded-lg" />
          <Text className="flex-1 font-sans text-body-sm text-secondary-text">
            Attached — sent with your message
          </Text>
          <Pressable onPress={() => setAttached(null)} className="p-2">
            <X size={18} color={colors.secondaryText} />
          </Pressable>
        </View>
      )}
      <View className="mx-4 mb-2 flex-row items-center rounded-full border border-border bg-surface-1 px-2 py-1">
        <View>
          <Pressable
            onPress={() => setPlusOpen((o) => !o)}
            className="h-9 w-9 items-center justify-center rounded-full border border-border"
          >
            <Plus size={22} color={colors.primary} />
          </Pressable>
          {plusOpen && (
            <View className="absolute bottom-11 left-0 w-48 rounded-card border border-border bg-surface-1 py-1">
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
          className="flex-1 px-3 font-sans text-body-md text-primary-text"
        />
        <Pressable onPress={() => void toggleDictation()} className="px-1 py-1">
          <Mic size={22} color={listening ? colors.primary : colors.secondaryText} />
        </Pressable>
        <Pressable disabled={!canSend} onPress={() => void handleSend()} className="px-2 py-1">
          <Send size={22} color={canSend ? colors.primary : colors.secondaryText} />
        </Pressable>
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
    <Pressable onPress={onPress} className="flex-row items-center gap-2.5 px-4 py-2.5">
      <Icon size={18} color={colors.primary} />
      <Text className="font-sans text-body-md text-primary-text">{label}</Text>
    </Pressable>
  );
}
