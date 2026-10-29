/** The voice tab's first-use setup sheet.
 *
 *  Ported from pocketpal-ai src/components/VoiceSetupSheet as LiAI's
 *  English copy on the shared Sheet, minus the "choose a neural voice"
 *  step (recorded divergence): the whisper row + a mic note + Continue —
 *  which downloads the setup tier when it isn't ready, then asks for the
 *  microphone, then reports done (the screen's controller takes over and
 *  enters). A refusal from the mic leaves the user here with the copy.
 *  The recheck-on-return-from-Settings is not wired: the controller's own
 *  entry gate re-asks the mic on every press, so this sheet needn't.
 */

import { useEffect, useRef, useState } from "react";
import { AppState, Pressable, Text, View } from "react-native";

import { setupTierFor } from "@/store/asr.ts";
import { useAsrStore } from "@/store/asr.ts";
import { useVoice } from "@/store/voice.ts";
import { Sheet } from "@/components/sheet.tsx";
import { WhisperModelRow } from "@/components/voice/whisper-model-row.tsx";
import { ensureMicAccess } from "@/services/voice/mic-access.ts";
import { hasVoiceFile, ensureVoiceFile } from "@/services/tts/voiceFiles.ts";
import type { Voice } from "@/services/tts/types.ts";

export function VoiceSetupSheet({
  visible,
  onClose,
  onDone,
}: {
  visible: boolean;
  onClose: () => void;
  /** Called once the tier is downloaded (if needed) and the mic is granted. */
  onDone: () => void;
}) {
  type VoiceFileState = "present" | "missing" | "downloading" | "failed";
  const voiceKey = (v: Voice | null) => (v ? `${v.engine}:${v.id}` : null);

  const tier = useAsrStore((s) => setupTierFor(s.selectedTier, s.downloadStates));
  const tierReady = useAsrStore((s) => s.isSelectedTierReady);
  const [file, setFile] = useState<VoiceFileState | null>(null);
  const downloading =
    useAsrStore((s) => s.downloadStates[tier] === "downloading") || file === "downloading";
  const downloadModel = useAsrStore((s) => s.downloadModel);

  const currentVoice = useVoice((s) => s.currentVoice);
  const voiceName = currentVoice?.name ?? "System voice";
  const [mic, setMic] = useState<"pending" | "granted" | "refused">("pending");
  const [busy, setBusy] = useState(false);
  // A resolve after the sheet closed must not call onDone.
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  const checkedVoice = currentVoice && currentVoice.engine !== "system" ? voiceKey(currentVoice) : null;

  useEffect(() => {
    setFile(null);
    const v = currentVoice;
    if (!visible || !v || v.engine === "system") {
      return;
    }
    let active = true;
    void hasVoiceFile(v).then((present) => {
      if (active) setFile(present ? "present" : "missing");
    });
    return () => {
      active = false;
    };
  }, [visible, checkedVoice]);

  const setupInterrupted = () =>
    !visibleRef.current || AppState.currentState === "background";

  const proceed = async () => {
    const target = currentVoice;
    setBusy(true);
    try {
      if (!tierReady) {
        await downloadModel(tier);
        if (!useAsrStore.getState().isSelectedTierReady || setupInterrupted()) {
          return;
        }
      }
      if (target && target.engine !== "system") {
        if (file !== "present") setFile("downloading");
        const downloaded = await ensureVoiceFile(target);
        if (voiceKey(useVoice.getState().currentVoice) !== voiceKey(target)) {
          return;
        }
        setFile(downloaded ? "present" : "failed");
        if (!downloaded || setupInterrupted()) {
          return;
        }
      }
      const access = await ensureMicAccess();
      if (!visibleRef.current) return;
      if (access === "granted") {
        setMic("granted");
        onDone();
      } else {
        setMic("refused");
      }
    } finally {
      setBusy(false);
    }
  };

  if (!visible) return null;

  return (
    <Sheet
      visible
      title="Set up voice mode"
      onClose={onClose}
      scrollable={false}
      testID="voice-setup-sheet"
    >
      <View className="gap-3">
        <Text className="font-sans text-body-md text-secondary-text">
          A small model runs on your phone so you can talk offline.
        </Text>
        <View className="rounded-2xl bg-surface-2 px-4 py-3">
          <WhisperModelRow tier={tier} testIDPrefix="voice-setup" />
        </View>
        <View className="rounded-2xl bg-surface-2 px-4 py-3">
          <Text className="font-sans text-body-md text-primary-text">
            Voice
          </Text>
          <Text className="mt-1 text-quiet">
            {currentVoice && currentVoice.engine !== "system"
              ? file === "present"
                ? `${voiceName} — ready`
                : file === "failed"
                  ? `${voiceName} — download failed`
                  : file === "downloading"
                    ? `${voiceName} — downloading`
                    : `${voiceName} — not downloaded`
              : `${voiceName} — ready`}
          </Text>
        </View>
        <Text
          testID="voice-setup-mic"
          className={
            mic === "refused"
              ? "font-sans text-body-sm text-error"
              : "text-quiet"
          }
        >
          {mic === "refused"
            ? "Voice mode needs microphone access."
            : "We'll ask for microphone access next."}
        </Text>
        <Pressable
          disabled={busy || downloading}
          onPress={() => void proceed()}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy || downloading }}
          accessibilityLabel={downloading ? "Downloading" : "Continue"}
          className={`btn btn--primary active:opacity-80 ${
            busy || downloading ? "btn--disabled" : ""
          }`}
          testID="voice-setup-continue"
        >
          <Text className="text-action">
            {downloading ? "Downloading…" : "Continue"}
          </Text>
        </Pressable>
        <Pressable
          onPress={onClose}
          className="btn btn--ghost active:opacity-80"
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          testID="voice-setup-cancel"
        >
          <Text className="text-body">Cancel</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}
