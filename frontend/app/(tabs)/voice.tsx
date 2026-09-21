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

import { colors } from "../../themes/tokens.ts";
import { VOICE_STATUS_LABEL } from "../../lib/voiceStatus.ts";
import {
  fadeEntering,
  useMotionDuration,
  useTabContentFade,
} from "../../lib/motion.ts";
import { useVoiceLoop } from "../../hooks/useVoiceLoop.ts";

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
      <Text className="px-4 py-3 text-center font-sans-semibold text-h3 text-primary">
        Voice
      </Text>

      <Animated.ScrollView style={contentFade} contentContainerClassName="flex-1 items-center justify-center px-8">
        <Pressable onPress={bargeIn}>
          <View
            className={`h-40 w-40 items-center justify-center rounded-full border bg-surface-1 ${
              micLive ? "border-primary" : "border-border"
            }`}
          >
            <Mic size={72} color={micLive ? colors.primary : colors.secondaryText} />
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
          <View className="w-full rounded-card border border-border bg-surface-1 p-4">
            <View className="flex-row items-center">
              <ActivityIndicator size="small" color={colors.primary} />
              <Text className="ml-3 flex-1 font-sans text-body-md text-primary-text">
                Playing audio…
              </Text>
              <Pressable onPress={bargeIn} className="rounded-full border border-error px-4 py-1">
                <Text className="font-sans-semibold text-body-md text-secondary-text">
                  Stop
                </Text>
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
            <Pressable onPress={() => void retry()} className="mt-1 px-4 py-1">
              <Text className="font-sans text-body-md text-primary">Try again</Text>
            </Pressable>
          </View>
        )}
      </Animated.ScrollView>

      <Text className="pb-2 text-center font-sans text-body-sm text-secondary-text">
        Tap the mic to talk
      </Text>
    </SafeAreaView>
  );
}
