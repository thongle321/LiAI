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

import { useEffect } from "react";
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
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { openSettings } from "expo-linking";
import { Mic } from "lucide-react-native";

import { colors } from "../../../themes/tokens.ts";
import { VOICE_STATUS_LABEL } from "../../../lib/voiceStatus.ts";
import {
  MOTION_DURATION_MS,
  fadeEntering,
  motionEasing,
  usePressFeedback,
} from "../../../lib/motion.ts";
import { useVoiceLoop } from "../../../hooks/useVoiceLoop.ts";
import { useModelReady } from "../../../hooks/useModelReady.ts";

export default function VoiceScreen() {
  const { phase, heard, reply, issue, needsSettings, bargeIn, retry } = useVoiceLoop();
  const motionDuration = MOTION_DURATION_MS;
  const replyVisible = phase === "speaking";
  const micPress = usePressFeedback();

  // Overlay fades in on reply start, fades out when audio ends.
  // Always mounted — only opacity changes, so nothing ever shifts.
  const overlayOpacity = useSharedValue(0);
  useEffect(() => {
    overlayOpacity.value = withTiming(replyVisible ? 1 : 0, {
      duration: replyVisible ? 150 : 200,
      easing: motionEasing,
    });
  }, [replyVisible, overlayOpacity]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  const micLive = phase === "listening" || phase === "speaking";
  // No model loaded: the mic would start a turn that can never answer, so
  // it is disabled. The disabled mic IS the signal (flattened ring + greyed
  // icon); no warning copy or way-forward button here.
  const modelReady = useModelReady();
  // Disabled drops the ring so a flat circle reads "off" next to the ringed
  // enabled state.
  const micRing = modelReady ? "border-border" : "border-transparent";

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

      <ScrollView contentContainerClassName="flex-1 items-center justify-center px-8">
        {/* The hit area IS the visual: a 44px target wrapped around a 160px
            circle would make the outer ring dead to the thumb. */}
        <Animated.View style={micPress.animatedStyle}>
          <Pressable
            onPress={modelReady ? bargeIn : undefined}
            onPressIn={micPress.onPressIn}
            onPressOut={micPress.onPressOut}
            disabled={!modelReady}
            className="h-40 w-40 items-center justify-center rounded-full"
            accessibilityRole="button"
            accessibilityState={{ disabled: !modelReady }}
            accessibilityLabel={micLive ? "Stop listening" : "Tap to speak"}
          >
            {/* Listening is a machine-in-the-loop state: a Surface Tint circle
                with concentric Signal Blue rings. Disabled is Mist + Slate,
                kept findable (DESIGN: disabled is a fill/label change, never
                opacity on a live element). */}
            <View
              className={`h-40 w-40 items-center justify-center rounded-full ${
                modelReady ? (micLive ? "bg-surface-3" : "bg-surface-2") : "bg-surface-2"
              }`}
            >
              <View
                className={`h-32 w-32 items-center justify-center rounded-full border ${micRing}`}
              >
                <Mic
                  size={56}
                  color={modelReady ? (micLive ? colors.primary : colors.secondaryText) : colors.secondaryText}
                />
              </View>
            </View>
          </Pressable>
        </Animated.View>

        <Animated.Text
          key={phase}
          entering={fadeEntering(motionDuration)}
          className="mt-6 text-center font-sans-semibold text-h3 text-primary-text"
        >
          {VOICE_STATUS_LABEL[phase]}
        </Animated.Text>
        {/* Heard slot never unmounts: nbsp holds the line when silent. */}
        <Text className="mt-3 min-h-12 text-center font-sans text-body-md text-secondary-text">
          {heard !== "" && phase !== "speaking" ? heard : " "}
        </Text>

        <Animated.View
          style={overlayStyle}
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
                className="btn btn--ghost px-5 py-2"
                accessibilityRole="button"
                accessibilityLabel="Stop playback"
              >
                <Text className="font-sans-semibold text-body-md text-primary">Stop</Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>

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
              className="btn btn--ghost mt-1 px-5 py-2"
              accessibilityRole="button"
              accessibilityLabel="Try again"
            >
              <Text className="font-sans text-body-md text-primary">Try again</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {/* The disabled mic carries the no-model state on its own; no warning
          copy or way-forward button here (the user removed it). */}
      <Text className="pb-2 text-center font-sans text-body-md text-secondary-text">
        Tap the mic to talk
      </Text>
    </SafeAreaView>
  );
}
