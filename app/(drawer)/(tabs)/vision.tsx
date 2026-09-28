/** Vision tab: full-screen live camera, floating controls.
 *
 * A real Tabs.Screen (moved from app/vision.tsx): the bottom tab bar hides
 * ITSELF while this route is focused — see (tabs)/_layout.tsx — so the
 * camera keeps the full screen. Top: exit (left), camera flip + VISION
 * label (right) — no nav bar. Center: the live preview, never frozen,
 * never covered except by the floats. Bottom: compact status area, big
 * mic in the center, small keyboard button opening a floating input.
 * Exit always lands on Chat — vision's only entry point is the tab bar,
 * so there is no "previous screen" to return to.
 *
 * Frame rule: a 500ms JS interval snapshots and uploads frames while
 * idle/listening; the worklet frame processor is a bridge-free heartbeat
 * only (no JS calls — the worklet→JS bridge proved unreliable). A voice
 * or text question pauses uploads, sends the current frame + question,
 * then resumes after the answer and TTS finish. The preview itself
 * never freezes.
 */

import { useState } from "react";
import { useRef } from "react";
import { View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useIsFocused } from "expo-router";
import { openSettings } from "expo-linking";
import { useCameraDevice, useCameraPermission } from "react-native-vision-camera";
import type { Camera as VisionCameraView } from "react-native-vision-camera";

import { colors } from "../../../themes/tokens.ts";
import { useTabContentFade } from "../../../lib/motion.ts";
import { VOICE_STATUS_LABEL } from "../../../lib/voiceStatus.ts";
import { useVisionTurn } from "../../../hooks/useVisionTurn.ts";
import { useModelReady } from "../../../hooks/useModelReady.ts";
import {
  VisionBottomPanel,
  VisionPreview,
  VisionTopFloat,
} from "../../../components/VisionOverlays.tsx";

export default function VisionScreen() {
  const [position, setPosition] = useState<"back" | "front">("back");
  const [camLive, setCamLive] = useState(false);
  const [camProblem, setCamProblem] = useState<string | null>(null);
  const [inputOpen, setInputOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const camera = useRef<VisionCameraView | null>(null);
  // No model: talk and type are disabled so the mic can't open a turn that
  // can never answer.
  const modelReady = useModelReady();

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
    // A tab has no "back": the only way in is the tab bar, so the only
    // way out is a known tab. Chat is the home tab.
    router.navigate("/chat");
  }

  function sendDraft(): void {
    if (draft.trim() === "") return;
    sendText(draft);
    setDraft("");
    setInputOpen(false);
  }

  return (
    // edges={[]}: the camera preview is genuinely full-bleed, and the two
    // overlays own the top and bottom insets themselves (they are measured
    // at runtime). A default SafeAreaView here would pad the same two edges
    // a second time and push both overlays off-screen under edge-to-edge.
    <SafeAreaView edges={[]} style={{ flex: 1, backgroundColor: colors.base }}>
      <View className="flex-1 bg-black">
        <VisionPreview
          hasPermission={hasPermission}
          device={device}
          focused={focused}
          fade={contentFade}
          cameraRef={camera}
          onReady={() => setCamLive(true)}
          onProblem={setCamProblem}
          onGrant={() => void requestPermission()}
        />

        {camLive ? (
          <>
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
              statusLabel={VOICE_STATUS_LABEL[phase]}
              camProblem={camProblem}
              inputOpen={inputOpen}
              draft={draft}
              onDraftChange={setDraft}
              onSendDraft={sendDraft}
              onToggleInput={() => setInputOpen((o) => !o)}
              onTalk={() => void bargeIn()}
              modelReady={modelReady}
            />
          </>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
