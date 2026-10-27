/** The full-screen voice session view (spec: hands-free in chat, issue 02).
 *
 *  The Voice tab's session screen, made reusable: the LiAI orb (the
 *  existing phase→orb-state mapping, no redesign), the per-phase status
 *  title + hint strings with the error-variant slot for the session's last
 *  issue, live-region phase announcements for screen readers, the End
 *  control, and two reserved slots — a mic-mute control (issue 05) and a
 *  drag handle row the collapse gesture will enter through (issue 04;
 *  pull-down resistance lands there too). Everything is read from the
 *  session circuit the caller passes (the store-backed surface of
 *  hooks/useVoiceMode); the only local state is the caption toggle.
 *
 *  The Voice tab renders its session through this component and is
 *  visually unchanged; the chat surface (issue 03) just needs a gate
 *  wrapper around the same view.
 */

import { useEffect, useState, type ReactElement } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { openSettings } from "expo-linking";

import {
  MOTION_DURATION_MS,
  fadeEntering,
  motionEasing,
} from "@/utils/motion.ts";
import { useVoiceLevels } from "expo-thinking-orbs";
import type { VoiceModeSurface } from "@/hooks/useVoiceMode.ts";
import {
  VOICE_MODE_STATE_LABEL,
  VOICE_MODE_VERB_LABEL,
} from "@/services/voice/voice-status.ts";
import { VoiceOrbHero } from "@/components/voice/voice-orb-hero.tsx";

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
    heard,
    reply,
    issue,
    needsMicSettings,
    requestEntry,
    tapCloud,
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

  return (
    <ScrollView contentContainerClassName="flex-1 items-center justify-center px-8">
      {/* RESERVED (issue 04, collapse-to-bar): the drag handle row. The
          pull-down/flick gesture that collapses this view into the bar
          enters through this slot; pull-down resistance lands there. */}
      <View testID="voice-drag-handle-slot" />

      <VoiceOrbHero phase={phase} failed={failed} mic={mic} onTap={orbPress} />

      {/* Two-line label: uppercase state name + verb (matches expo-thinking-orbs example).
          The live region announces every phase change to screen readers. */}
      <Animated.Text
        key={phase}
        entering={fadeEntering(MOTION_DURATION_MS)}
        accessibilityLiveRegion="polite"
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

      {/* RESERVED (issue 05, mic mute): the mute control's slot. Toggling
          mutes the capture without ending the session; the orb renders a
          greyed, frozen variant while the slot is live. */}
      <View testID="voice-mute-slot" />
    </ScrollView>
  );
}
