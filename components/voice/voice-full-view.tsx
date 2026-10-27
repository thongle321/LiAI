/** The full-screen voice session view (spec: voice-tab hands-free parity,
 *  the view half of the old "hands-free in chat" issue 02).
 *
 *  The Voice tab's session screen: the LiAI orb (the existing phase→orb-
 *  state mapping, no redesign), the per-phase status title + hint strings
 *  with the error-variant slot for the session's last issue, the muted
 *  override (Microphone off), live-region phase announcements for screen
 *  readers, the End control, the mic-mute control, and the drag-handle row
 *  the collapse-to-bar gesture enters through. Everything is read from the
 *  session circuit the caller passes (the store-backed surface of
 *  hooks/useVoiceMode); the only local state is the caption toggle.
 *
 *  The Voice tab renders its session through this component; the chat
 *  surface never mounts it (contrast the research doc's overlay framing,
 *  rejected in the parity spec).
 */

import { useEffect, useState, type ReactElement } from "react";
import { BackHandler, Pressable, ScrollView, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { openSettings } from "expo-linking";

import {
  MOTION_DURATION_MS,
  fadeEntering,
  motionEasing,
} from "@/utils/motion.ts";
import { pullsCollapse } from "@/utils/voice-collapse.ts";
import { useVoiceLevels } from "expo-thinking-orbs";
import type { VoiceModeSurface } from "@/hooks/useVoiceMode.ts";
import {
  voiceModeHintLabel,
  voiceModeStateLabel,
  voiceModeVerbLabel,
} from "@/services/voice/voice-status.ts";
import { VoiceOrbHero } from "@/components/voice/voice-orb-hero.tsx";
import { VoiceMuteControl } from "@/components/voice/voice-mute.tsx";

interface VoiceFullViewProps {
  /** The mic capsule — fed by the controller's onMicAudio seam via the
   *  screen's sink registration (capsules live per-screen, not here). */
  mic: ReturnType<typeof useVoiceLevels>;
  /** The store-backed session surface (hooks/useVoiceMode contract). */
  voice: VoiceModeSurface;
}

export function VoiceFullView({
  mic,
  voice,
}: VoiceFullViewProps): ReactElement {
  const {
    phase,
    micMuted,
    heard,
    reply,
    issue,
    needsMicSettings,
    requestEntry,
    tapCloud,
    toggleMute,
    collapse,
    end,
  } = voice;
  const open = phase !== "closed";
  const speaking = phase === "speaking";
  // An issue with no live session is a dead gate — the orb freezes as
  // `failed`. Mid-session problems keep the shell live; the text explains.
  const failed = issue !== null && !open;
  // Tap-orb semantics stay as today: closed enters the gates (requestEntry);
  // a live session taps the cloud (end-of-utterance / interrupt; no-op
  // while starting — the controller decides per phase).
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

  // Collapse to the in-tab bar (spec: voice-tab hands-free parity). The
  // gesture is scoped to the handle row because the session view scrolls —
  // the reference drags the whole overlay; an in-tab divergence. The pull
  // shows as rubber-band resistance on the row; the collapse / spring-back
  // hop happens in onEnd. Tapping the row is the same exit.
  const reduceMotion = useReducedMotion();
  const handleDrag = useSharedValue(0);
  const handleStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: handleDrag.value }],
  }));
  const pullDown = Gesture.Pan()
    .activeOffsetY(15)
    .withTestId("voice-view-pull")
    .onUpdate((event) => {
      if (!reduceMotion) {
        // Rubber-band: the row follows at a fraction of the finger so the
        // pull reads as resistance, not as progress.
        handleDrag.value = Math.max(0, event.translationY) / 3;
      }
    })
    .onEnd((event) => {
      if (pullsCollapse(event.translationY, event.velocityY)) {
        scheduleOnRN(collapse);
        return;
      }
      if (!reduceMotion) {
        handleDrag.value = withSpring(0);
      }
    });

  useEffect(() => {
    if (!open) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      collapse();
      return true;
    });
    return () => subscription.remove();
  }, [open, collapse]);

  return (
    <ScrollView contentContainerClassName="flex-1 items-center justify-center px-8">
      {/* The collapse row (issue 04): drag handle + hint, tap = collapse,
          pull-down = collapse at the reference's thresholds. Mounted only
          in a live session — the closed gate has nothing to collapse. */}
      {open && (
        <GestureDetector gesture={pullDown}>
          <Pressable
            onPress={collapse}
            accessibilityRole="button"
            accessibilityLabel="Collapse voice view"
            testID="voice-view-collapse"
            className="items-center py-3"
          >
            <Animated.View
              style={handleStyle}
              className="items-center"
            >
              <View
                className="h-[5px] w-10 rounded-full bg-border"
              />
              <Text className="mt-1 font-sans text-xs text-secondary-text">
                Pull down to collapse
              </Text>
            </Animated.View>
          </Pressable>
        </GestureDetector>
      )}

      <VoiceOrbHero
        phase={phase}
        failed={failed}
        muted={micMuted}
        mic={mic}
        onTap={orbPress}
      />

      {/* Two-line label: uppercase state name + verb (matches expo-thinking-orbs example).
          A muted listen overrides both lines (Microphone off). The live
          region announces every change to screen readers. */}
      <Animated.Text
        key={phase + String(micMuted)}
        entering={fadeEntering(MOTION_DURATION_MS)}
        accessibilityLiveRegion="polite"
        className="mt-6 text-center font-sans-bold text-h3 text-primary-text uppercase tracking-wide"
      >
        {voiceModeStateLabel(phase, micMuted)}
      </Animated.Text>
      <Animated.Text
        key={phase + "-verb-" + String(micMuted)}
        entering={fadeEntering(MOTION_DURATION_MS)}
        className="mt-1 text-center font-sans text-body-md text-secondary-text"
      >
        {voiceModeVerbLabel(phase, micMuted)}
      </Animated.Text>
      {voiceModeHintLabel(phase, micMuted) !== "" &&
        voiceModeHintLabel(phase, micMuted) !== voiceModeVerbLabel(phase, micMuted) && (
        <Text className="mt-1 text-center text-quiet">
          {voiceModeHintLabel(phase, micMuted)}
        </Text>
      )}
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

      {/* The error variant of the status hint: the session's last issue,
          shown here until the next phase change clears it. A blocked mic
          gets the Settings hop; anything else is dead text (retry rides
          the orb when the gate is closed). */}
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

      {/* The mute control replaces its reserved slot (issue 05): toggling
          mutes the capture without ending the session; the orb above
          renders the greyed, frozen treatment while it is live. */}
      {open && (
        <VoiceMuteControl muted={micMuted} onToggle={toggleMute} size="full" />
      )}
    </ScrollView>
  );
}
