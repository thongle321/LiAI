/** Standalone vision screen: full-screen live camera, floating controls.
 *
 * Top: stop-vision (left), camera flip + VISION label (right) — no nav
 * bar. Center: the live preview, never frozen, never covered except by
 * the floats. Bottom: compact status area, big mic in the center,
 * small keyboard button opening a floating input. No BottomNav here —
 * vision is not a tab; stop-vision returns to the previous screen.
 *
 * Frame rule: the preview streams frames while idle/listening. A voice or
 * text question pauses uploads, sends the current frame + question, then
 * resumes streaming after the answer and TTS finish. The preview itself never
 * freezes.
 */

import { useState } from "react";
import { useRef } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Animated from "react-native-reanimated";
import { router, useIsFocused } from "expo-router";
import { openSettings } from "expo-linking";
import { Keyboard, Mic, Send, SwitchCamera, X } from "lucide-react-native";
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  type Camera as VisionCameraView,
} from "react-native-vision-camera";

import { colors } from "../themes/tokens.ts";
import { useTabContentFade } from "../lib/motion.ts";
import { VOICE_STATUS_LABEL } from "../lib/voiceStatus.ts";
import { useVisionTurn } from "../hooks/useVisionTurn.ts";

export default function VisionScreen() {
  const [position, setPosition] = useState<"back" | "front">("back");
  const [camLive, setCamLive] = useState(false);
  const [camProblem, setCamProblem] = useState<string | null>(null);
  const [inputOpen, setInputOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const camera = useRef<VisionCameraView | null>(null);

  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice(position);
  const focused = useIsFocused();
  const insets = useSafeAreaInsets();
  const contentFade = useTabContentFade();

  const {
    phase,
    answer,
    issue,
    needsSettings,
    streamProblem,
    bargeIn,
    retry,
    sendText,
    stopAll,
  } = useVisionTurn(camera, () => camLive && device !== undefined);

  function flip(): void {
    setCamLive(false);
    setCamProblem(null);
    setPosition((p) => (p === "back" ? "front" : "back"));
  }

  function exit(): void {
    stopAll();
    router.back();
  }

  function sendDraft(): void {
    if (draft.trim() === "") return;
    sendText(draft);
    setDraft("");
    setInputOpen(false);
  }

  const statusLabel = VOICE_STATUS_LABEL[phase];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#000" }}>
      <View className="flex-1 bg-black">
        {hasPermission && device !== undefined ? (
          <Animated.View style={[{ flex: 1 }, contentFade]}>
            <Camera
              ref={camera}
              style={{ flex: 1 }}
              device={device}
              isActive={focused}
              photo
              onInitialized={() => setCamLive(true)}
              onError={(e: { message?: unknown }) =>
                setCamProblem(`Camera error: ${String(e.message ?? e)}`)
              }
            />
          </Animated.View>
        ) : (
          <View className="flex-1 items-center justify-center px-8">
            {!hasPermission ? (
              <>
                <Text className="text-center font-sans text-body-md text-primary-text">
                  Camera access is needed to see.
                </Text>
                <Pressable
                  onPress={() => void requestPermission()}
                  className="btn btn--primary mt-4"
                >
                  <Text className="font-sans-semibold text-on-primary">Grant access</Text>
                </Pressable>
              </>
            ) : (
              <Text className="text-center font-sans text-body-md text-primary-text">
                No camera device found.
              </Text>
            )}
          </View>
        )}

        {/* Top float: stop left, flip + label right. */}
        <View
          className="absolute left-0 right-0 flex-row items-center px-4"
          style={{ top: insets.top + 8 }}
        >
          <Pressable onPress={exit} className="p-2" accessibilityLabel="Stop vision">
            <X size={24} color="#fff" />
          </Pressable>
          <View className="flex-1" />
          <Pressable onPress={flip} className="p-2" accessibilityLabel="Switch camera">
            <SwitchCamera size={22} color="#fff" />
          </Pressable>
          <Text className="ml-1 font-sans-semibold text-caption tracking-widest text-white">
            VISION
          </Text>
        </View>

        {/* Bottom floats: status, input, mic row. */}
        <View
          className="absolute left-0 right-0 px-5"
          style={{ bottom: insets.bottom + 12 }}
        >
          <View className="rounded-card bg-black/60 px-4 py-3">
            {issue !== null ? (
              needsSettings ? (
                <Pressable onPress={() => void openSettings()}>
                  <Text className="text-center font-sans text-body-md text-primary">
                    {issue}
                  </Text>
                </Pressable>
              ) : (
                <View className="items-center">
                  <Text className="text-center font-sans text-body-md text-white">
                    {issue}
                  </Text>
                  <Pressable onPress={() => void retry()} className="mt-1 px-4 py-1">
                    <Text className="font-sans text-body-md text-primary">Try again</Text>
                  </Pressable>
                </View>
              )
            ) : phase === "thinking" ? (
              <Text className="text-center font-sans text-body-md text-white">
                LiAI…
              </Text>
            ) : answer !== "" ? (
              <ScrollView className="max-h-[120px]">
                <Text className="text-center font-sans text-body-md text-white">
                  {answer}
                </Text>
              </ScrollView>
            ) : (
              <Text className="text-center font-sans text-body-md text-white/80">
                {phase === "idle" ? "Tap the mic and ask about what you see" : statusLabel}
              </Text>
            )}
            {camProblem !== null && (
              <Text className="mt-1 text-center font-sans text-body-sm text-white/70">
                {camProblem}
              </Text>
            )}
            {streamProblem !== null && (
              <Text className="mt-1 text-center font-sans text-body-sm text-white/70">
                {streamProblem}
              </Text>
            )}
          </View>

          {inputOpen && (
            <View className="mt-2 flex-row items-center rounded-full bg-black/60 px-2 py-1">
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Ask about this…"
                placeholderTextColor={colors.secondaryText}
                multiline
                autoFocus
                onSubmitEditing={sendDraft}
                className="flex-1 px-3 font-sans text-body-md text-white"
              />
              <Pressable onPress={sendDraft} className="px-2 py-1">
                <Send size={22} color={colors.primary} />
              </Pressable>
            </View>
          )}

          <View className="mt-3 flex-row items-center justify-center">
            <View className="w-12 items-center">
              <Pressable
                onPress={() => setInputOpen((o) => !o)}
                className="h-12 w-12 items-center justify-center rounded-full bg-black/60"
                accessibilityLabel="Type a question"
              >
                <Keyboard size={22} color="#fff" />
              </Pressable>
            </View>
            <Pressable onPress={() => void bargeIn()} accessibilityLabel="Talk">
              <View
                className={`mx-4 h-20 w-20 items-center justify-center rounded-full border-2 ${
                  phase === "idle" ? "border-primary" : "border-white"
                } bg-black/60`}
              >
                <Mic size={30} color={phase === "idle" ? colors.primary : "#fff"} />
              </View>
            </Pressable>
            <View className="w-12" />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
