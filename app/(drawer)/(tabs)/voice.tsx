/** Standalone voice tab (tap-to-talk), driven by the unified-Whisper
 *  session controller (hooks/useVoiceMode — ported from PocketPal's
 *  useVoiceMode, one Whisper tier for dictation + voice mode).
 *
 *  Redesigned around the expo-thinking-orbs shell (docs/specs/
 *  2026-10-25-voice-tab-orb-redesign.md): the mic disc it replaces is now
 *  components/voice/voice-orb-hero.tsx — a VoiceOrb that resolves its
 *  behaviour from the session phase and swells with the live audio. The
 *  orb IS the hero: centered, and the hit area — closed it enters the
 *  gates, a live session taps the cloud (end-of-utterance / interrupt).
 *
 *  Below it the label + heard line never move: the caption and overlay
 *  stay mounted (invisible when idle) so layout never shifts; the reply
 *  overlay still shows "Playing audio…" + Stop while the machine speaks,
 *  and the End button is the explicit way out (the tab bar switches
 *  away otherwise). Sheets are the controller's pre-entry gates.
 */

import { useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Eye } from "lucide-react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { openSettings } from "expo-linking";
import { useRouter, useIsFocused } from "expo-router";

import { ASR_SAMPLE_RATE } from "@/services/asr/constants.ts";
import { useColors } from "@/themes/tokens.ts";
import {
  MOTION_DURATION_MS,
  fadeEntering,
  motionEasing,
} from "@/utils/motion.ts";
import { useVoiceMode } from "@/hooks/useVoiceMode.ts";
import {
  VOICE_MODE_LABEL,
  VOICE_MODE_STATE_LABEL,
  VOICE_MODE_VERB_LABEL,
} from "@/services/voice/voice-status.ts";
import { useModelStore } from "@/store/model-store.ts";
import { VoiceSetupSheet } from "@/components/voice/voice-setup-sheet.tsx";
import { VoiceMemorySheet } from "@/components/voice/voice-memory-sheet.tsx";
import { VoiceOrbHero } from "@/components/voice/voice-orb-hero.tsx";
import { VisionMode } from "@/components/voice/voice-vision-mode.tsx";
import { useVoiceLevels } from "expo-thinking-orbs";

export default function VoiceScreen() {
  const colors = useColors();
  const router = useRouter();
  // The corner Eye anchors to the REAL top inset: a fixed offset put it
  // under the status bar on the device (overlapped and untappable).
  const insets = useSafeAreaInsets();
  // The mic capsule lives here (not the hero) so the controller's
  // onMicAudio seam fills it every 50 ms chunk while listening.
  const mic = useVoiceLevels({ sampleRate: ASR_SAMPLE_RATE });
  const voice = useVoiceMode({
    openModels: () => router.push("/models"),
    onMicAudio: mic.setSamples,
  });
  const {
    phase,
    heard,
    reply,
    issue,
    needsMicSettings,
    sheet,
    requestEntry,
    dismissSheet,
    setupDone,
    continueAnyway,
    openModels,
    tapCloud,
    end,
  } = voice;
  const open = phase !== "closed";
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
    if (open) void end();
    setVisionOn(true);
  };
  // The memory sheet's breakdown labels the chat side with the ACTIVE
  // model's name; nothing loaded hands the title to the body copy.
  const activeModelId = useModelStore((s) => s.activeModelId);
  const models = useModelStore((s) => s.models);
  const chatModelName =
    models.find((m) => m.id === activeModelId)?.name ?? "this chat model";
  const speaking = phase === "speaking";
  // An issue with no live session is a dead gate — the orb freezes as
  // `failed`. Mid-session problems keep the shell live; the text explains.
  const failed = issue !== null && !open;
  const orbPress = (): void => {
    if (open) {
      tapCloud();
    } else {
      void requestEntry();
    }
  };

  // Captions: tap the heard line to toggle the live transcript.
  const [captionsOn, setCaptionsOn] = useState(true);

  // Overlay fades in on reply start, fades out when audio ends.
  // Always mounted — only opacity changes, so nothing ever shifts.
  const overlayOpacity = useSharedValue(0);
  useEffect(() => {
    overlayOpacity.value = withTiming(speaking ? 1 : 0, {
      duration: speaking ? 150 : 200,
      easing: motionEasing,
    });
  }, [speaking, overlayOpacity]);
  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

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
      <ScrollView contentContainerClassName="flex-1 items-center justify-center px-8">
        <VoiceOrbHero
          phase={phase}
          failed={failed}
          mic={mic}
          onTap={orbPress}
        />

        {/* Two-line label: uppercase state name + verb (matches expo-thinking-orbs example) */}
        <Animated.Text
          key={phase}
          entering={fadeEntering(MOTION_DURATION_MS)}
          className="mt-6 text-center font-sans-bold text-h3 text-primary-text uppercase tracking-wide"
        >
          {VOICE_MODE_STATE_LABEL[phase]}
        </Animated.Text>
        <Animated.Text
          key={phase + "-verb"}
          entering={fadeEntering(MOTION_DURATION_MS)}
          className="mt-1 text-center font-sans text-body-md text-secondary-text"
        >
          {VOICE_MODE_VERB_LABEL[phase]}
        </Animated.Text>
        {/* Heard slot never unmounts: nbsp holds the line when silent.
            Tap to toggle captions. Hidden while the machine speaks — the
            reply caption takes over below. */}
        <Pressable
          onPress={() => setCaptionsOn((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={captionsOn ? "Hide captions" : "Show captions"}
        >
          <Text className="mt-3 min-h-12 text-center font-sans text-body-md text-secondary-text">
            {captionsOn && heard !== "" && !speaking ? heard : " "}
          </Text>
        </Pressable>

        {/* While the machine speaks the orb IS the indicator: the overlay
            is just the way to stop it, riding the cloud tap. */}
        <Animated.View
          style={overlayStyle}
          pointerEvents={speaking ? "auto" : "none"}
          className="absolute bottom-8 left-8 right-8"
        >
          <View className="surface bg-surface-1 flex-row items-center p-4">
            <Text className="flex-1 font-sans text-body-md text-primary-text">
              Playing audio…
            </Text>
            <Pressable
              onPress={tapCloud}
              className="btn btn--ghost active:opacity-80 px-5 py-2"
              accessibilityRole="button"
              accessibilityLabel="Stop playback"
            >
              <Text className="font-sans-semibold text-body-md text-primary">Stop</Text>
            </Pressable>
          </View>
        </Animated.View>

        {open && (
          <Pressable
            onPress={() => void end()}
            className="btn btn--ghost active:opacity-80 mt-6 px-6 py-2"
            accessibilityRole="button"
            accessibilityLabel="End conversation"
          >
            <Text className="font-sans-semibold text-body-md text-primary">End</Text>
          </Pressable>
        )}

        {reply !== null && reply !== "" && (
          <Text className="mt-4 text-center font-sans text-body-md text-primary-text">
            {reply}
          </Text>
        )}

        {issue !== null && (
          <View className="mt-4 items-center">
            {needsMicSettings ? (
              <Pressable
                onPress={() => void openSettings().catch(() => {})}
                accessibilityRole="button"
                accessibilityLabel={issue}
              >
                <Text className="text-center font-sans text-body-sm text-primary">
                  {issue}
                </Text>
              </Pressable>
            ) : (
              <Text className="text-center text-quiet">
                {issue}
              </Text>
            )}
            {!open && (
              <Pressable
                onPress={() => void requestEntry()}
                className="btn btn--ghost active:opacity-80 mt-1 px-5 py-2"
                accessibilityRole="button"
                accessibilityLabel="Try again"
              >
                <Text className="text-body">Try again</Text>
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>

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
          onContinue={() => void continueAnyway()}
          onChooseSmallerModel={openModels}
        />
      )}
    </SafeAreaView>
  );
}
