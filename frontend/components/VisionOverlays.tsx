/** Vision screen overlays: preview, top float, bottom panel.
 *
 * Extracted from app/vision.tsx so the screen stays orchestration
 * (hook + callbacks) while this file owns the large JSX blocks.
 */

import type { ComponentProps, RefObject } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import Animated from "react-native-reanimated";
import { Keyboard, Mic, Send, SwitchCamera, X } from "lucide-react-native";
import {
  Camera,
  type CameraDevice,
  type Camera as VisionCameraView,
} from "react-native-vision-camera";

import { colors } from "../themes/tokens.ts";
import type { useTabContentFade } from "../lib/motion.ts";
import type { VoicePhase } from "../lib/voiceStatus.ts";

export function VisionPreview({
  hasPermission,
  device,
  focused,
  fade,
  cameraRef,
  frameProcessor,
  onReady,
  onProblem,
  onGrant,
}: {
  hasPermission: boolean;
  device: CameraDevice | undefined;
  focused: boolean;
  fade: ReturnType<typeof useTabContentFade>;
  cameraRef: RefObject<VisionCameraView | null>;
  frameProcessor: ComponentProps<typeof Camera>["frameProcessor"];
  onReady: () => void;
  onProblem: (message: string) => void;
  onGrant: () => void;
}) {
  if (hasPermission && device !== undefined) {
    return (
      <Animated.View style={[{ flex: 1 }, fade]}>
        <Camera
          ref={cameraRef}
          style={{ flex: 1 }}
          device={device}
          isActive={focused}
          photo
          frameProcessor={frameProcessor}
          onInitialized={onReady}
          onError={(e: { message?: unknown }) =>
            onProblem(`Camera error: ${String(e.message ?? e)}`)
          }
        />
      </Animated.View>
    );
  }
  return (
    <View className="flex-1 items-center justify-center px-8">
      {!hasPermission ? (
        <>
          <Text className="text-center font-sans text-body-md text-primary-text">
            Camera access is needed to see.
          </Text>
          <Pressable onPress={onGrant} className="btn btn--primary mt-4">
            <Text className="font-sans-semibold text-on-primary">Grant access</Text>
          </Pressable>
        </>
      ) : (
        <Text className="text-center font-sans text-body-md text-primary-text">
          No camera device found.
        </Text>
      )}
    </View>
  );
}

export function VisionTopFloat({
  top,
  onExit,
  onFlip,
}: {
  top: number;
  onExit: () => void;
  onFlip: () => void;
}) {
  return (
    <View
      className="absolute left-0 right-0 flex-row items-center px-4"
      style={{ top }}
    >
      <Pressable onPress={onExit} className="p-2" accessibilityLabel="Stop vision">
        <X size={24} color={colors.inverseText} />
      </Pressable>
      <View className="flex-1" />
      <Pressable onPress={onFlip} className="p-2" accessibilityLabel="Switch camera">
        <SwitchCamera size={22} color={colors.inverseText} />
      </Pressable>
      <Text className="ml-1 font-sans-semibold text-caption tracking-widest text-white">
        VISION
      </Text>
    </View>
  );
}

export function VisionBottomPanel({
  bottom,
  issue,
  needsSettings,
  onOpenSettings,
  onRetry,
  phase,
  answer,
  caption,
  statusLabel,
  camProblem,
  streamProblem,
  inputOpen,
  draft,
  onDraftChange,
  onSendDraft,
  onToggleInput,
  onTalk,
}: {
  bottom: number;
  issue: string | null;
  needsSettings: boolean;
  onOpenSettings: () => void;
  onRetry: () => void;
  phase: VoicePhase;
  answer: string;
  caption: string;
  statusLabel: string;
  camProblem: string | null;
  streamProblem: string | null;
  inputOpen: boolean;
  draft: string;
  onDraftChange: (s: string) => void;
  onSendDraft: () => void;
  onToggleInput: () => void;
  onTalk: () => void;
}) {
  return (
    <View
      className="absolute left-0 right-0 px-5"
      style={{ bottom }}
    >
      <View className="rounded-card bg-black/60 px-4 py-3">
        {issue !== null ? (
          needsSettings ? (
            <Pressable onPress={onOpenSettings}>
              <Text className="text-center font-sans text-body-md text-primary">
                {issue}
              </Text>
            </Pressable>
          ) : (
            <View className="items-center">
              <Text className="text-center font-sans text-body-md text-white">
                {issue}
              </Text>
              <Pressable onPress={onRetry} className="mt-1 px-4 py-1">
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
        ) : caption !== "" ? (
          <ScrollView className="max-h-[120px]">
            <Text className="text-center font-sans text-body-md text-white/90">
              {caption}
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
            onChangeText={onDraftChange}
            placeholder="Ask about this…"
            placeholderTextColor={colors.secondaryText}
            multiline
            autoFocus
            onSubmitEditing={onSendDraft}
            className="flex-1 px-3 font-sans text-body-md text-white"
          />
          <Pressable onPress={onSendDraft} className="px-2 py-1">
            <Send size={22} color={colors.primary} />
          </Pressable>
        </View>
      )}

      <View className="mt-3 flex-row items-center justify-center">
        <View className="w-12 items-center">
          <Pressable
            onPress={onToggleInput}
            className="h-12 w-12 items-center justify-center rounded-full bg-black/60"
            accessibilityLabel="Type a question"
          >
            <Keyboard size={22} color={colors.inverseText} />
          </Pressable>
        </View>
        <Pressable onPress={onTalk} accessibilityLabel="Talk">
          <View
            className={`mx-4 h-20 w-20 items-center justify-center rounded-full border-2 ${
              phase === "idle" ? "border-primary" : "border-white"
            } bg-black/60`}
          >
            <Mic size={30} color={phase === "idle" ? colors.primary : colors.inverseText} />
          </View>
        </Pressable>
        <View className="w-12" />
      </View>
    </View>
  );
}
