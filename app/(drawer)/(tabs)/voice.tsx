/** Standalone voice tab (tap-to-talk), driven by the unified-Whisper
 *  session controller (hooked ONCE at the tab layout — this screen is a
 *  consumer: hooks/useVoiceSession("voice") reads the session circuit and
 *  its blur guard re-anchors exit-on-blur to the screen that started the
 *  session; components/voice/voice-session-host.tsx owns the controller
 *  so chat can share the same machinery later).
 *
 *  The session body is the shared full-screen view
 *  (components/voice/voice-full-view.tsx, spec: voice-tab hands-free
 *  parity) — the orb, per-phase status strings, the issue line, End, mute
 *  and the collapse-to-bar gesture all live there. A live session pulled
 *  down renders the collapsed bar (components/voice/voice-bar.tsx) pinned
 *  at the tab's bottom instead — same session, same mic; the swap rides
 *  the circuit's `presentation` field. This screen keeps what is ITS own:
 *  the mic-sink registration for the orb's level feed, the pre-entry gate
 *  sheets, and the corner Eye that swaps in vision (a mode of this tab,
 *  not a destination).
 */

import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Eye } from "lucide-react-native";
import { useIsFocused } from "expo-router";

import { ASR_SAMPLE_RATE } from "@/services/asr/constants.ts";
import { useColors } from "@/themes/tokens.ts";
import { useVoiceSession, setVoiceMicSink } from "@/hooks/useVoiceMode.ts";
import { useModelStore } from "@/store/model-store.ts";
import { useVoice } from "@/store/voice.ts";
import { VoiceSetupSheet } from "@/components/voice/voice-setup-sheet.tsx";
import { VoiceMemorySheet } from "@/components/voice/voice-memory-sheet.tsx";
import { VoiceFullView } from "@/components/voice/voice-full-view.tsx";
import { VoiceBar } from "@/components/voice/voice-bar.tsx";
import { VisionMode } from "@/components/voice/voice-vision-mode.tsx";
import { useVoiceLevels } from "expo-thinking-orbs";

export default function VoiceScreen() {
  const colors = useColors();
  // The corner Eye anchors to the REAL top inset: a fixed offset put it
  // under the status bar on the device (overlapped and untappable).
  const insets = useSafeAreaInsets();
  // The mic capsule lives here (not the hero) so the controller's
  // onMicAudio seam fills it every 50 ms chunk while listening.
  const mic = useVoiceLevels({ sampleRate: ASR_SAMPLE_RATE });
  // The controller lives at the tab layout now; this screen registers its
  // level capsule as the orb's feed for the duration it owns the surface.
  useEffect(() => setVoiceMicSink(mic.setSamples), [mic.setSamples]);
  const voice = useVoiceSession("voice");
  const { phase, sheet, requestEntry, dismissSheet, setupDone, continueAnyway, openModels, end } = voice;
  // Vision is a mode of this tab, not a destination: the Eye toggle swaps
  // this screen over to the camera HUD (components/voice/
  // voice-vision-mode.tsx) while the router stays on /voice.
  const [visionOn, setVisionOn] = useState(false);
  // Losing focus IS leaving vision: switching to chat must not leave the
  // camera armed behind the blur, and coming back lands on the orb.
  const focused = useIsFocused();
  useEffect(() => {
    if (!focused) setVisionOn(false);
  }, [focused]);
  const enterVision = (): void => {
    // Cleanup before the camera: ending an open session stops its mic
    // capture synchronously (the engine release finishes behind us), and
    // a parked gate sheet is dismissed so returning lands clean on the orb.
    if (sheet !== null) dismissSheet();
    if (phase !== "closed") void end();
    setVisionOn(true);
  };
  // The memory sheet's breakdown labels the chat side with the ACTIVE
  // model's name; nothing loaded hands the title to the body copy.
  const activeModelId = useModelStore((s) => s.activeModelId);
  const models = useModelStore((s) => s.models);
  const chatModelName =
    models.find((m) => m.id === activeModelId)?.name ?? "this chat model";
  const currentVoice = useVoice((s) => s.currentVoice);
  const voiceName = currentVoice?.name ?? "this voice";

  // The mode's body owns its own full-bleed shell (it needs different
  // SafeAreaView edges than the voice trunk), so the swap replaces the
  // whole tree. Every hook above ran; nothing below is shared.
  if (visionOn) {
    return <VisionMode onExit={() => setVisionOn(false)} />;
  }

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{ flex: 1, backgroundColor: colors.base }}
    >
      {/* The collapsed presentation (issue 04): the live session rides a
          bar pinned at the tab's bottom — tap/swipe up re-expands. The
          session, mic and turns are untouched across the swap. */}
      {voice.presentation === "bar" ? (
        <View className="flex-1 justify-end px-4 pb-4">
          <VoiceBar mic={mic} voice={voice} />
        </View>
      ) : (
        <VoiceFullView mic={mic} voice={voice} />
      )}

      {/* Vision's one entry point: a corner Eye riding on voice mode. It
          is always here (covered by the mode's own "vision is off for
          this model" notice); a late press hands over to the camera HUD. */}
      <Pressable
        onPress={enterVision}
        className="absolute right-4 h-12 w-12 items-center justify-center active:opacity-80"
        style={{ top: insets.top + 8 }}
        accessibilityRole="button"
        accessibilityLabel="Open vision"
      >
        <Eye size={24} color={colors.secondaryText} />
      </Pressable>

      {/* The controller's pre-entry sheets, rendered by its `sheet` state. */}
      {sheet?.kind === "setup" && (
        <VoiceSetupSheet
          visible
          onDone={() => void setupDone()}
          onClose={dismissSheet}
        />
      )}
      {sheet?.kind === "memory" && (
        <VoiceMemorySheet
          fit={sheet.fit}
          onClose={dismissSheet}
          chatModelName={chatModelName}
          voiceName={voiceName}
          onContinue={() => void continueAnyway()}
          onChooseSmallerModel={openModels}
        />
      )}
    </SafeAreaView>
  );
}
