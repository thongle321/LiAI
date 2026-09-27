/** Vision screen overlays: preview, top float, bottom panel.
 *
 * Extracted from app/vision.tsx so the screen stays orchestration
 * (hook + callbacks) while this file owns the large JSX blocks.
 */

import type { RefObject } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import { Keyboard, Mic, Send, SwitchCamera, X } from "lucide-react-native";
import {
  Camera,
  type CameraDevice,
  type Camera as VisionCameraView,
} from "react-native-vision-camera";

import { colors, scrim } from "../themes/tokens.ts";
import { usePressFeedback, type useTabContentFade } from "../lib/motion.ts";
import type { VoicePhase } from "../lib/voiceStatus.ts";

export function VisionPreview({
  hasPermission,
  device,
  focused,
  fade,
  cameraRef,
  onReady,
  onProblem,
  onGrant,
}: {
  hasPermission: boolean;
  device: CameraDevice | undefined;
  focused: boolean;
  fade: ReturnType<typeof useTabContentFade>;
  cameraRef: RefObject<VisionCameraView | null>;
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

/** Four Signal Blue corner brackets (DESIGN.md AI States).
 *
 * "Vision Active" is a HUD element, so the frame is drawn as four L-marks
 * rather than a border — a bordered frame would read as a container.
 */
export function VisionActiveFrame({
  side = 28,
  color = colors.primary,
}: {
  /** Length of each bracket arm, in px. */
  side?: number;
  color?: string;
}) {
  const CORNERS = [
    { key: "topLeft", top: true, left: true },
    { key: "topRight", top: true, left: false },
    { key: "bottomLeft", top: false, left: true },
    { key: "bottomRight", top: false, left: false },
  ] as const;
  return (
    <View pointerEvents="none" className="absolute inset-0">
      {CORNERS.map(({ key, top, left }) => (
        <View
          key={key}
          style={{
            position: "absolute",
            ...(top ? { top: 0 } : { bottom: 0 }),
            ...(left ? { left: 0 } : { right: 0 }),
            width: side,
            height: side,
            borderColor: color,
            borderTopWidth: top ? 2 : 0,
            borderBottomWidth: top ? 0 : 2,
            borderLeftWidth: left ? 2 : 0,
            borderRightWidth: left ? 0 : 2,
          }}
        />
      ))}
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
  const exitPress = usePressFeedback();
  const flipPress = usePressFeedback();
  return (
    <View
      className="absolute left-0 right-0 flex-row items-center px-5"
      style={{ top }}
    >
      <Animated.View style={exitPress.animatedStyle}>
        <Pressable
          onPress={onExit}
          onPressIn={exitPress.onPressIn}
          onPressOut={exitPress.onPressOut}
          className="h-12 w-12 items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="Stop vision"
        >
          <X size={24} color={colors.inverseText} />
        </Pressable>
      </Animated.View>
      <View className="flex-1" />
      <Animated.View style={flipPress.animatedStyle}>
        <Pressable
          onPress={onFlip}
          onPressIn={flipPress.onPressIn}
          onPressOut={flipPress.onPressOut}
          className="h-12 w-12 items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="Switch camera"
        >
          <SwitchCamera size={22} color={colors.inverseText} />
        </Pressable>
      </Animated.View>
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
  statusLabel,
  camProblem,
  inputOpen,
  draft,
  onDraftChange,
  onSendDraft,
  onToggleInput,
  onTalk,
  modelReady,
}: {
  bottom: number;
  issue: string | null;
  needsSettings: boolean;
  onOpenSettings: () => void;
  onRetry: () => void;
  phase: VoicePhase;
  answer: string;
  statusLabel: string;
  camProblem: string | null;
  inputOpen: boolean;
  draft: string;
  onDraftChange: (s: string) => void;
  onSendDraft: () => void;
  onToggleInput: () => void;
  onTalk: () => void;
  /** No active model: talk + type are disabled and greyed. */
  modelReady: boolean;
}) {
  const retryPress = usePressFeedback();
  const settingsPress = usePressFeedback();
  const sendPress = usePressFeedback();
  const toggleInputPress = usePressFeedback();
  const talkPress = usePressFeedback();
  // The panel lifts by the keyboard height so the draft input clears it,
  // leaving the camera preview full-bleed (the screen's documented rule).
  // Both platforms: the app is edge-to-edge, so the window does NOT resize
  // for the keyboard on Android either. This was briefly gated to iOS on
  // the assumption that Android's adjustResize already handled it, which
  // left the draft input under the keyboard on Android.
  const { height } = useReanimatedKeyboardAnimation();
  const liftStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -height.value }],
  }));
  return (
    <Animated.View
      className="absolute left-0 right-0 px-5"
      style={[{ bottom }, liftStyle]}
    >
      <View className="rounded-lg px-5 py-3" style={{ backgroundColor: scrim }}>
        {issue !== null ? (
          needsSettings ? (
            <Animated.View style={settingsPress.animatedStyle}>
              <Pressable
                onPress={onOpenSettings}
                onPressIn={settingsPress.onPressIn}
                onPressOut={settingsPress.onPressOut}
              >
                <Text className="text-center font-sans text-body-md text-primary">
                  {issue}
                </Text>
              </Pressable>
            </Animated.View>
          ) : (
            <View className="items-center">
              <Text className="text-center font-sans text-body-md text-white">
                {issue}
              </Text>
              {/* A labelled text action is a button, not a circular control:
                  Default radius per the button spec, and a real 48px target. */}
              <Animated.View style={retryPress.animatedStyle}>
                <Pressable
                  onPress={onRetry}
                  onPressIn={retryPress.onPressIn}
                  onPressOut={retryPress.onPressOut}
                  className="btn btn--ghost mt-2 min-h-12 min-w-24"
                  accessibilityRole="button"
                  accessibilityLabel="Try again"
                >
                  <Text className="font-sans text-body-md text-primary">Try again</Text>
                </Pressable>
              </Animated.View>
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
      </View>

      {inputOpen && (
        <View className="mt-2 flex-row items-center rounded-lg px-2 py-1" style={{ backgroundColor: scrim }}>
          <TextInput
            value={draft}
            onChangeText={modelReady ? onDraftChange : () => undefined}
            editable={modelReady}
            placeholder="Ask about this…"
            placeholderTextColor={colors.secondaryText}
            multiline
            autoFocus={modelReady}
            className="flex-1 px-3 font-sans text-body-md text-white"
          />
          <Animated.View style={sendPress.animatedStyle}>
            <Pressable
              onPress={onSendDraft}
              onPressIn={sendPress.onPressIn}
              onPressOut={sendPress.onPressOut}
              disabled={!modelReady}
              className="h-12 w-12 items-center justify-center"
              accessibilityRole="button"
              accessibilityState={{ disabled: !modelReady }}
              accessibilityLabel="Send question"
            >
              <Send size={22} color={modelReady ? colors.primary : colors.secondaryText} />
            </Pressable>
          </Animated.View>
        </View>
      )}

      <View className="mt-3 flex-row items-center justify-center">
        <Animated.View style={toggleInputPress.animatedStyle}>
          <Pressable
            onPress={modelReady ? onToggleInput : undefined}
            onPressIn={toggleInputPress.onPressIn}
            onPressOut={toggleInputPress.onPressOut}
            disabled={!modelReady}
            className="h-12 w-12 items-center justify-center rounded-full"
            style={{ backgroundColor: scrim }}
            accessibilityRole="button"
            accessibilityState={{ disabled: !modelReady }}
            accessibilityLabel="Type a question"
          >
            <Keyboard size={22} color={modelReady ? colors.inverseText : colors.secondaryText} />
          </Pressable>
        </Animated.View>
        <Animated.View style={talkPress.animatedStyle}>
          <Pressable
            onPress={modelReady ? onTalk : undefined}
            onPressIn={talkPress.onPressIn}
            onPressOut={talkPress.onPressOut}
            disabled={!modelReady}
            className="h-20 w-20 items-center justify-center"
            accessibilityRole="button"
            accessibilityState={{ disabled: !modelReady }}
            accessibilityLabel={phase === "idle" ? "Talk" : "Stop talking"}
          >
          {/* Disabled on the camera ground: the scrim disc is the fill
              (Mist would be a light disc on a dark frame) and DESIGN's
              "disabled has no border" holds, so the primary ring is dropped
              and only the muted icon remains. */}
          <View
            className={`h-20 w-20 items-center justify-center rounded-full ${
              !modelReady ? "" : phase === "idle" ? "border border-primary" : "bg-surface-3"
            }`}
            {...(phase === "idle" || !modelReady
              ? { style: { backgroundColor: scrim } }
              : {})}
          >
            {phase !== "idle" && modelReady && <VisionActiveFrame side={22} />}
            <Mic size={30} color={modelReady ? colors.primary : colors.secondaryText} />
          </View>
          </Pressable>
        </Animated.View>
        <View className="w-12" />
      </View>
    </Animated.View>
  );
}
