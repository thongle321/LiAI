/** Standalone voice tab (tap-to-talk).
 *
 * Render-only screen: the turn loop lives in hooks/useVoiceLoop. Its
 * own tab, so no X button — the bottom tab bar switches away. Big
 * static mic + status text; your live words show while talking; while
 * the AI replies a block shows a loading spinner + "Playing audio..."
 * + Stop with the reply text below. Layout never moves: the heard
 * line and overlay stay mounted (invisible when idle) and nothing
 * animates except the overlay fade.
 */

import { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Animated as LegacyAnimated,
  Pressable,
  Text,
  View,
} from "react-native";
import Animated from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { openSettings } from "expo-linking";
import { Mic } from "lucide-react-native";

import { colors } from "../../../themes/tokens.ts";
import { VOICE_STATUS_LABEL } from "../../../lib/voiceStatus.ts";
import {
  fadeEntering,
  useMotionDuration,
  useTabContentFade,
} from "../../../lib/motion.ts";
import { useVoiceLoop } from "../../../hooks/useVoiceLoop.ts";

export default function VoiceScreen() {
  const { phase, heard, reply, issue, needsSettings, bargeIn, retry } = useVoiceLoop();
  const fade = useRef(new LegacyAnimated.Value(0)).current;
  const motionDuration = useMotionDuration();
  const contentFade = useTabContentFade();
  const replyVisible = phase === "speaking";

  // Overlay fades in on reply start, fades out when audio ends.
  // Always mounted — only opacity changes, so nothing ever shifts.
  useEffect(() => {
    LegacyAnimated.timing(fade, {
      toValue: replyVisible ? 1 : 0,
      duration: replyVisible ? 150 : 200,
      useNativeDriver: true,
    }).start();
  }, [replyVisible, fade]);

  const micLive = phase === "listening" || phase === "speaking";

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{ flex: 1, backgroundColor: colors.base }}
    >
      {/* Voice screen title: Ink, matching the header geometry of every
          other screen. Blue is reserved for the one live control. */}
      <View className="h-14 items-center justify-center border-b border-border bg-surface-1 px-5">
        <Text className="font-sans-semibold text-h2 text-primary-text">Voice</Text>
      </View>

      <Animated.ScrollView style={contentFade} contentContainerClassName="flex-1 items-center justify-center px-8">
        <Pressable
          onPress={bargeIn}
          className="h-11 w-11"
          accessibilityRole="button"
          accessibilityLabel={micLive ? "Stop listening" : "Tap to speak"}
        >
          {/* Listening is a machine-in-the-loop state: a Surface Tint circle
              with concentric Signal Blue rings. */}
          <View
            className={`h-40 w-40 items-center justify-center rounded-full ${
              micLive ? "bg-surface-3" : "bg-surface-2"
            }`}
          >
            <View
              className={`h-32 w-32 items-center justify-center rounded-full border ${
                micLive ? "border-primary" : "border-border"
              }`}
            >
              <Mic size={56} color={micLive ? colors.primary : colors.secondaryText} />
            </View>
          </View>
        </Pressable>

        <Animated.Text
          key={phase}
          entering={fadeEntering(motionDuration)}
          className="mt-6 text-center font-sans-semibold text-h3 text-primary-text"
        >
          {VOICE_STATUS_LABEL[phase]}
        </Animated.Text>
        {/* Heard slot never unmounts: nbsp holds the line when silent. */}
        <Text className="mt-3 min-h-12 text-center font-sans text-body-md text-secondary-text">
          {heard !== "" && phase !== "speaking" ? heard : " "}
        </Text>

        <LegacyAnimated.View
          style={{ opacity: fade }}
          pointerEvents={replyVisible ? "auto" : "none"}
          className="mt-6 w-full"
        >
          <View className="w-full rounded-lg border border-border bg-surface-1 p-5">
            <View className="flex-row items-center">
              <View className="h-10 w-10 items-center justify-center rounded-full bg-surface-3">
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
              <Text className="ml-3 flex-1 font-sans text-body-md text-primary-text">
                Playing audio…
              </Text>
              <Pressable
                onPress={bargeIn}
                className="btn btn--ghost min-h-11 px-5 py-2"
                accessibilityRole="button"
                accessibilityLabel="Stop playback"
              >
                <Text className="font-sans-semibold text-body-md text-primary">Stop</Text>
              </Pressable>
            </View>
          </View>
        </LegacyAnimated.View>

        {reply !== "" && (
          <Text className="mt-4 text-center font-sans text-body-md text-primary-text">
            {reply}
          </Text>
        )}

        {issue !== null && (
          <View className="mt-4 items-center">
            {needsSettings ? (
              <Pressable onPress={() => void openSettings()}>
                <Text className="text-center font-sans text-body-sm text-primary">
                  {issue}
                </Text>
              </Pressable>
            ) : (
              <Text className="text-center font-sans text-body-sm text-secondary-text">
                {issue}
              </Text>
            )}
            <Pressable
              onPress={() => void retry()}
              className="btn btn--ghost mt-1 min-h-11 px-5 py-2"
              accessibilityRole="button"
              accessibilityLabel="Try again"
            >
              <Text className="font-sans text-body-md text-primary">Try again</Text>
            </Pressable>
          </View>
        )}
      </Animated.ScrollView>

      <Text className="pb-2 text-center font-sans text-caption text-secondary-text">
        Tap the mic to talk
      </Text>
    </SafeAreaView>
  );
}
