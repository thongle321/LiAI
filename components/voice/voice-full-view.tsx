/** The full-screen voice session view (spec: voice-tab hands-free parity,
 *  the view half of the old "hands-free in chat" issue 02).
 *
 *  The Voice tab's session screen: the LiAI orb (the existing phase→orb-
 *  state mapping, no redesign), the per-phase status title + hint strings
 *  with the error-variant slot for the session's last issue, the muted
 *  override (Microphone off), live-region phase announcements for screen
 *  readers, the mic-mute control, and the End control. Collapse-to-bar was
 *  removed: voice is its own tab, so there is no bar to collapse into.
 */

import { useEffect, type ReactElement } from "react";
import { AccessibilityInfo, Pressable, ScrollView, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { X } from "lucide-react-native";

import {
  MOTION_DURATION_MS,
  fadeEntering,
} from "@/utils/motion.ts";
import { useColors } from "@/themes/tokens.ts";
import { openSettings } from "expo-linking";
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
  const colors = useColors();
  const {
    phase,
    micMuted,
    reply,
    issue,
    needsMicSettings,
    requestEntry,
    tapCloud,
    toggleMute,
    end,
  } = voice;
  const open = phase !== "closed";
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

  // Announce status changes to screen readers (PocketPal parity).
  useEffect(() => {
    if (!open) return;
    const title = voiceModeStateLabel(phase, micMuted);
    const message = issue !== null ? `${title}. ${issue}` : title;
    void AccessibilityInfo.announceForAccessibility(message);
  }, [open, phase, micMuted, issue]);

  return (
    <ScrollView contentContainerClassName="flex-1 items-center justify-center px-8">
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

      {/* The mute + End controls (PocketPal full-view control row). */}
      {open && (
        <View className="mt-8 flex-row items-center gap-6">
          <VoiceMuteControl muted={micMuted} onToggle={toggleMute} size="full" />
          <Pressable
            onPress={() => void end()}
            accessibilityRole="button"
            accessibilityLabel="End voice session"
            testID="voice-end"
            className="h-16 w-16 items-center justify-center rounded-full bg-error active:opacity-80"
          >
            <X size={24} color={colors.onPrimary} />
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}
