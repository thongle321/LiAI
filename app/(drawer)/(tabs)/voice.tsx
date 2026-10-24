/** Standalone voice tab (tap-to-talk), driven by the unified-Whisper
 *  session controller (hooks/useVoiceMode — ported from PocketPal's
 *  useVoiceMode, one Whisper tier for dictation + voice mode).
 *
 *  Its own tab, so no X button — the bottom tab bar switches away. Big
 *  static mic + status label; your live words show while talking; while
 *  the AI replies a block shows a loading spinner + "Playing audio..."
 *  + Stop with the reply text below. Layout never moves: the heard line
 *  and overlay stay mounted (invisible when idle); only the mic pulses
 *  while listening and the overlay fades.
 *
 *  Entry is the controller's: model → tier (sheets here) → mic → memory
 *  fit (sheet here) → listening. A tap mid-session is the cloud tap
 *  (end-of-utterance / interrupt); End ends the session outright.
 */

import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { openSettings } from "expo-linking";
import { useRouter } from "expo-router";
import { Mic } from "lucide-react-native";

import { useColors } from "@/themes/tokens.ts";
import {
  MOTION_DURATION_MS,
  fadeEntering,
  motionEasing,
  usePressFeedback,
} from "@/utils/motion.ts";
import { useVoiceMode } from "@/hooks/useVoiceMode.ts";
import { VOICE_MODE_LABEL } from "@/services/voice/voice-status.ts";
import { useModelStore } from "@/store/model-store.ts";
import { VoiceSetupSheet } from "@/components/voice/voice-setup-sheet.tsx";
import { VoiceMemorySheet } from "@/components/voice/voice-memory-sheet.tsx";

export default function VoiceScreen() {
  const colors = useColors();
  const router = useRouter();
  const voice = useVoiceMode({
    openModels: () => router.push("/models"),
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
  // The memory sheet's breakdown labels the chat side with the ACTIVE
  // model's name; nothing loaded hands the title to the body copy.
  const activeModelId = useModelStore((s) => s.activeModelId);
  const models = useModelStore((s) => s.models);
  const chatModelName =
    models.find((m) => m.id === activeModelId)?.name ?? "this chat model";
  const motionDuration = MOTION_DURATION_MS;
  const speaking = phase === "speaking";
  const micPress = usePressFeedback();
  // Captions: tap the heard line to toggle the live transcript.
  const [captionsOn, setCaptionsOn] = useState(true);
  // Gentle pulse while listening — reuses reanimated, no new deps.
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (phase === "listening") {
      pulse.value = withRepeat(
        withTiming(1.04, { duration: 900, easing: motionEasing }),
        -1,
        true,
      );
    } else {
      pulse.value = withTiming(1, { duration: 150, easing: motionEasing });
    }
  }, [phase, pulse, motionEasing]);
  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

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

  // Speech is live (mouth or machine): the mic sits in the ringed, colored
  // state. Every other phase keeps the plain circle — a session loading
  // model weights looks different from idle by its LABEL, not its layout.
  const micLive = phase === "listening" || phase === "speaking";

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{ flex: 1, backgroundColor: colors.base }}
    >
      <ScrollView contentContainerClassName="flex-1 items-center justify-center px-8">
        {/* The hit area IS the visual: a 44px target wrapped around a 160px
            circle would make the outer ring dead to the thumb. */}
        <Animated.View style={micPress.animatedStyle}>
          <Pressable
            onPress={open ? tapCloud : () => void requestEntry()}
            onPressIn={micPress.onPressIn}
            onPressOut={micPress.onPressOut}
            className="h-40 w-40 items-center justify-center rounded-full"
            accessibilityRole="button"
            accessibilityLabel={open ? "Tap to stop or take the turn" : "Tap to speak"}
          >
            {/* Listening is a machine-in-the-loop state: a Surface Tint circle
                with concentric Signal Blue rings. Disabled is never used — a
                tap always does something now (entry routes the gates). */}
            <Animated.View
              style={pulseStyle}
              className={`h-40 w-40 items-center justify-center rounded-full ${
                micLive ? "bg-surface-3" : "bg-surface-2"
              }`}
            >
              <View className="h-32 w-32 items-center justify-center rounded-full border border-border">
                <Mic
                  size={56}
                  color={micLive ? colors.primary : colors.secondaryText}
                />
              </View>
            </Animated.View>
          </Pressable>
        </Animated.View>

        <Animated.Text
          key={phase}
          entering={fadeEntering(motionDuration)}
          className="mt-6 text-center font-sans-semibold text-h3 text-primary-text"
        >
          {VOICE_MODE_LABEL[phase]}
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

        {open && (
          <Pressable
            onPress={() => void end()}
            className="btn btn--ghost active:opacity-80 mt-4 px-5 py-2"
            accessibilityRole="button"
            accessibilityLabel="End conversation"
          >
            <Text className="font-sans-semibold text-body-md text-primary">End</Text>
          </Pressable>
        )}

        <Animated.View
          style={overlayStyle}
          pointerEvents={speaking ? "auto" : "none"}
          className="mt-6 w-full"
        >
          <View className="surface bg-surface-1 w-full p-5">
            <View className="flex-row items-center">
              <View className="h-10 w-10 items-center justify-center rounded-full bg-surface-3">
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
              <Text className="ml-3 flex-1 font-sans text-body-md text-primary-text">
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
          </View>
        </Animated.View>

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
