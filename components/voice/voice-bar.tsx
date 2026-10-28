/** VoiceBar (spec: voice-tab hands-free parity, issue 04): the collapsed
 *  session in the Voice tab's place after a pull-down, mostly a port of
 *  PocketPal's VoiceBar — mini orb, status title, mic mute, End — with the
 *  in-tab divergence: nothing behind it is the chat, so the swipe-up hint
 *  points at the voice view, and the bar is simply open/closed actions.
 *  The session, its mic and its turns keep running across the swap.
 *
 *  The orb mirrors VoiceOrbHero's contract without the tap (the whole
 *  expand area is one pressable): same phase → behaviour mapping, same
 *  muted treatment, same speech envelope.
 */

import { type ReactElement } from "react";
import { Pressable, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { VoiceOrb } from "expo-thinking-orbs";

import {
  VOICE_LIFT_LIMIT_PT,
  liftsExpand,
} from "@/utils/voice-collapse.ts";
import { useColors } from "@/themes/tokens.ts";
import { useVoiceLevels, type VoiceLevels } from "expo-thinking-orbs";
import type { VoiceModeSurface } from "@/hooks/useVoiceMode.ts";
import type { VoiceModePhase } from "@/services/voice/voice-status.ts";
import {
  voiceModeStateLabel,
  voiceOrbStateFor,
} from "@/services/voice/voice-status.ts";
import { useSynthSpeechLevel } from "./voice-orb-hero.tsx";
import { VoiceMuteControl } from "./voice-mute.tsx";

const BAR_ORB_SIZE = 56;

interface VoiceBarProps {
  mic: ReturnType<typeof useVoiceLevels>;
  voice: VoiceModeSurface;
}

export function VoiceBar({ mic, voice }: VoiceBarProps): ReactElement {
  const {
    phase,
    micMuted,
    issue,
    toggleMute,
    expand,
  } = voice;
  const colors = useColors();
  const open = phase !== "closed";
  const failed = issue !== null && !open;
  const mutedListen = micMuted && phase === "listening";
  const speech = useSynthSpeechLevel(phase === "speaking");

  const onError = issue !== null && phase !== "speaking";
  const subtitle = onError ? issue! : "Swipe up for voice view";

  const reduceMotion = useReducedMotion();
  const lift = useSharedValue(0);
  const liftStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: lift.value },
      { scale: 1 + lift.value / 4000 },
    ],
  }));
  const swipeUp = Gesture.Pan()
    .activeOffsetY(-15)
    .withTestId("voice-bar-swipe")
    .onUpdate((event) => {
      if (!reduceMotion) {
        lift.value = Math.max(-VOICE_LIFT_LIMIT_PT, Math.min(0, event.translationY));
      }
    })
    .onEnd((event) => {
      if (!reduceMotion) {
        lift.value = withSpring(0);
      }
      if (liftsExpand(event.translationY, event.velocityY)) {
        scheduleOnRN(expand);
      }
    });

  return (
    <GestureDetector gesture={swipeUp}>
      <Animated.View
        testID="voice-bar"
        style={[
          liftStyle,
          {
            shadowColor: colors.primaryText,
            shadowOffset: { width: 0, height: -4 },
            shadowOpacity: 0.08,
            shadowRadius: 24,
            elevation: 4,
          },
        ]}
        className="surface bg-surface-1 flex-row items-center rounded-full p-2"
      >
        <Pressable
          onPress={expand}
          accessibilityRole="button"
          accessibilityLabel="Reopen voice view"
          testID="voice-bar-expand"
          className="flex-1 flex-row items-center gap-3 px-1"
        >
          {/* The mini orb: same state mapping and muted treatment as the
              hero, ready to run as the mic reacts. */}
          <View className="h-14 w-14 items-center justify-center rounded-full bg-surface-2">
            <VoiceOrb
              state={voiceOrbStateFor(phase as VoiceModePhase, failed)}
              size={BAR_ORB_SIZE}
              color={mutedListen ? colors.secondaryText : colors.primary}
              paused={mutedListen}
              inputAmplitude={mic.level}
              inputLevels={mic as VoiceLevels}
              outputAmplitude={speech}
            />
          </View>
          <View className="min-w-0 flex-1">
            <Text
              accessibilityLiveRegion="polite"
              numberOfLines={1}
              className="font-sans-semibold text-body-md text-primary-text"
            >
              {voiceModeStateLabel(phase as VoiceModePhase, micMuted)}
            </Text>
            <Text
              testID="voice-bar-subtitle"
              numberOfLines={1}
              // The tuple comments in global.css own the unconditioned
              // spellings; the error swap rides the split ternary the
              // colour guard accepts (chat-menu.tsx pattern).
              className={`font-sans text-caption ${
                onError ? "text-error" : "text-secondary-text"
              }`}
            >
              {subtitle}
            </Text>
          </View>
        </Pressable>
        {/* The live-session controls the full view also presents. The
            ORB-level interrupt semantics stay on the full view (the bar
            body is one expand pressable), matching the reference bar's
            contract. */}
        <VoiceMuteControl muted={micMuted} onToggle={toggleMute} size="bar" />
      </Animated.View>
    </GestureDetector>
  );
}
