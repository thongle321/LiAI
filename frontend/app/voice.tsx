/** Standalone voice mode (ChatGPT-style hands-free loop).
 *
 * Render-only screen: the turn loop lives in hooks/useVoiceLoop.
 * Opened from the panel's voice tab. Big animated mic + status text;
 * your live words show while talking; while the AI replies an overlay
 * block shows a loading spinner + "Playing audio..." + Stop with the
 * reply text below. The composer mic keeps the old dictation feature.
 */

import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Mic, X } from "lucide-react-native";

import { colors } from "../themes/tokens.ts";
import { VOICE_STATUS_LABEL } from "../lib/voiceStatus.ts";
import { useVoiceLoop } from "../hooks/useVoiceLoop.ts";

export default function VoiceScreen() {
  const { phase, heard, reply, issue, bargeIn, close, retry } = useVoiceLoop();
  const pulse = useRef(new Animated.Value(1)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const [overlayOn, setOverlayOn] = useState(false);
  // Typewriter: the backend answers whole, so reveal the reply
  // progressively while it speaks (spec's streaming reply text).
  const [shown, setShown] = useState("");

  // Pulse the mic while listening; still otherwise.
  useEffect(() => {
    if (phase !== "listening") {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.12, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [phase, pulse]);

  // Overlay fades in on reply start, fades out when audio ends.
  useEffect(() => {
    if (phase === "speaking") {
      setOverlayOn(true);
      Animated.timing(fade, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    } else {
      Animated.timing(fade, { toValue: 0, duration: 200, useNativeDriver: true }).start(
        ({ finished }) => {
          if (finished) setOverlayOn(false);
        },
      );
    }
  }, [phase, fade]);

  useEffect(() => {
    setShown("");
    if (reply === "") return;
    let i = 0;
    const timer = setInterval(() => {
      i += 4;
      setShown(reply.slice(0, i));
      if (i >= reply.length) clearInterval(timer);
    }, 40);
    return () => clearInterval(timer);
  }, [reply]);

  const micLive = phase === "listening" || phase === "speaking";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.base }}>
      <View className="flex-row items-center px-4 py-3">
        <View className="w-10">
          <Pressable onPress={close} className="px-1 py-1">
            <X size={24} color={colors.primary} />
          </Pressable>
        </View>
        <Text className="flex-1 text-center font-sans-semibold text-h3 text-primary">
          Voice
        </Text>
        <View className="w-10" />
      </View>

      <ScrollView contentContainerClassName="flex-1 items-center justify-center px-8">
        <Animated.View style={{ transform: [{ scale: pulse }] }}>
          <Pressable onPress={bargeIn}>
            <View
              className={`h-40 w-40 items-center justify-center rounded-full border bg-surface-1 ${
                micLive ? "border-primary" : "border-border"
              }`}
            >
              <Mic size={72} color={micLive ? colors.primary : colors.secondaryText} />
            </View>
          </Pressable>
        </Animated.View>

        <Text className="mt-6 text-center font-sans-semibold text-h3 text-primary-text">
          {VOICE_STATUS_LABEL[phase]}
        </Text>
        {heard !== "" && phase !== "speaking" && (
          <Text className="mt-3 text-center font-sans text-body-md text-secondary-text">
            {heard}
          </Text>
        )}

        {overlayOn && (
          <Animated.View style={{ opacity: fade }} className="mt-6 w-full">
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
          </Animated.View>
        )}

        {reply !== "" && (
          <Text className="mt-4 text-center font-sans text-body-md text-primary-text">
            {shown}
          </Text>
        )}

        {issue !== null && (
          <View className="mt-4 items-center">
            <Text className="text-center font-sans text-body-sm text-secondary-text">
              {issue}
            </Text>
            <Pressable onPress={() => void retry()} className="mt-1 px-4 py-1">
              <Text className="font-sans text-body-md text-primary">Try again</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      <Text className="pb-6 text-center font-sans text-body-sm text-secondary-text">
        Tap the mic to interrupt
      </Text>
    </SafeAreaView>
  );
}
