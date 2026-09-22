/** Standalone vision screen: full-screen live camera, floating controls.
 *
 * Top: stop-vision (left), camera flip + VISION label (right) — no nav
 * bar. Center: the live preview, never frozen, never covered except by
 * the floats. Bottom: compact status area, big mic in the center,
 * small keyboard button opening a floating input. No BottomNav here —
 * vision is not a tab; stop-vision returns to the previous screen.
 *
 * Frame rule: the preview streams frames while idle/listening, driven by
 * a Worklet Frame Processor at 2fps (needs a dev binary built with
 * enableFrameProcessors). A voice or text question pauses uploads, sends
 * the current frame + question, then resumes streaming after the answer
 * and TTS finish. The preview itself never freezes.
 */

import { useState } from "react";
import { useRef } from "react";
import { View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useIsFocused } from "expo-router";
import { openSettings } from "expo-linking";
import { useCameraDevice, useCameraPermission } from "react-native-vision-camera";
import type { Camera as VisionCameraView } from "react-native-vision-camera";

import { colors } from "../themes/tokens.ts";
import { useTabContentFade } from "../lib/motion.ts";
import { VOICE_STATUS_LABEL } from "../lib/voiceStatus.ts";
import { useVisionTurn } from "../hooks/useVisionTurn.ts";
import {
  VisionBottomPanel,
  VisionPreview,
  VisionTopFloat,
} from "../components/VisionOverlays.tsx";

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
    caption,
    issue,
    needsSettings,
    streamProblem,
    frameProcessor,
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.base }}>
      <View className="flex-1 bg-black">
        <VisionPreview
          hasPermission={hasPermission}
          device={device}
          focused={focused}
          fade={contentFade}
          cameraRef={camera}
          frameProcessor={frameProcessor}
          onReady={() => setCamLive(true)}
          onProblem={setCamProblem}
          onGrant={() => void requestPermission()}
        />

        <VisionTopFloat
          top={insets.top + 8}
          onExit={exit}
          onFlip={flip}
        />

        <VisionBottomPanel
          bottom={insets.bottom + 12}
          issue={issue}
          needsSettings={needsSettings}
          onOpenSettings={() => void openSettings()}
          onRetry={() => void retry()}
          phase={phase}
          answer={answer}
          caption={caption}
          statusLabel={VOICE_STATUS_LABEL[phase]}
          camProblem={camProblem}
          streamProblem={streamProblem}
          inputOpen={inputOpen}
          draft={draft}
          onDraftChange={setDraft}
          onSendDraft={sendDraft}
          onToggleInput={() => setInputOpen((o) => !o)}
          onTalk={() => void bargeIn()}
        />
      </View>
    </SafeAreaView>
  );
}
