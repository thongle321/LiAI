/** Vision tab: full-screen live camera above the shared tab bar.
 *
 * A real Tabs.Screen (moved from app/vision.tsx): the bottom tab bar
 * shows here exactly like on chat/voice, and the camera preview lives
 * in the column above it. Top: exit (left), camera flip + VISION label
 * (right) — no nav bar. Center: the live preview, never frozen, never
 * covered except by the floats. Bottom: compact status area, big mic in
 * the center, small keyboard button opening a floating input. Exit
 * always lands on Chat — vision's only entry point is the tab bar, so
 * there is no "previous screen" to return to.
 *
 * Question rule: one frame per question — snapshot-on-question. A voice
 * or text question snapshots the CURRENT frame at ask time and sends it
 * through the ordinary chat turn (no frame stream, no capture timer —
 * the chat pipeline carries the image), then speaks the answer back.
 * Watch mode (opt-in, 05) keeps a rolling buffer of recent frames so the
 * next question can ride the window — still nothing is inferred until
 * the user asks. The preview itself never freezes.
 */

import { useState, useEffect } from "react";
import { useRef } from "react";
import { View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useIsFocused } from "expo-router";
import { openSettings } from "expo-linking";
import { useCameraDevice, useCameraPermission } from "react-native-vision-camera";
import type { Camera as VisionCameraView } from "react-native-vision-camera";

import { colors } from "../../../themes/tokens.ts";
import { useKeyboardStore } from "../../../store/keyboard.ts";
import { VOICE_STATUS_LABEL } from "../../../lib/voiceStatus.ts";
import { useVisionTurn } from "../../../hooks/useVisionTurn.ts";
import { useWatchMode } from "../../../hooks/useWatchMode.ts";
import { useModelReady } from "../../../hooks/useModelReady.ts";
import { useModelStore } from "../../../store/modelStore";
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
  // Vision switched off on the active model: the frame would go out and
  // come back unprocessed, so the tab says so up front and offers the one
  // place that can fix it (Q5).
  const visionOff = useModelStore(
    (s) =>
      s.activeProviderType === "local" &&
      s.activeModelId !== null &&
      s.models.find(
        (m) => m.id === s.activeModelId && m.downloadStatus === "completed",
      )?.visionEnabled === false,
  );

  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice(position);
  const focused = useIsFocused();
  // Watch mode (05): captures into a rolling buffer while active; the
  // ask path reads frames() and answers ONLY on an explicit question.
  const watch = useWatchMode(
    camera,
    () => camLive && device !== undefined,
    focused && camLive,
  );
  // Android owns the permission prompt: opening this tab is the intent to
  // use the camera, so the system dialog is raised here instead of behind
  // an in-app button the user has to find. Re-entering the tab after a
  // denial asks again (the OS allows that unless "don't ask again" was
  // chosen), and a permanently-denied user gets the Open settings path.
  // useCameraPermission re-checks on app foreground, so returning from
  // system settings lights the camera up with no extra plumbing.
  useEffect(() => {
    if (focused && !hasPermission) void requestPermission();
  }, [focused, hasPermission, requestPermission]);
  const insets = useSafeAreaInsets();
  // The tab bar owns the bottom inset ("applied once, at the bar"), so the
  // panel anchors 12px above the bar top. When the keyboard opens the bar
  // hides and the screen grows by the bar's height — the same shift chat's
  // overlays compensate for — so the anchor carries that height back while
  // the keyboard is up, or the panel visibly jumps as the bar disappears.
  // The value doubles as the panel's lift anchor, so the draft input still
  // lands exactly on the keyboard top (see VisionBottomPanel).
  // Same store as the chat screen (store/keyboard.ts): the bar's MEASURED
  // height, not the seed constant — the label scales with the OS font
  // setting, so the real bar can be taller than the class sum, and the
  // anchor must track it or the panel drifts when large text is on.
  const keyboardVisible = useKeyboardStore((s) => s.isVisible);
  const tabBarHeight = useKeyboardStore((s) => s.tabBarHeight);
  const panelBottom =
    12 + (keyboardVisible ? tabBarHeight + insets.bottom : 0);
  // Two dead ends land on the same system screen: a denied camera and a
  // blocked mic. One handler for both.
  const goToSettings = () => void openSettings();

  const {
    phase,
    answer,
    issue,
    needsSettings,
    bargeIn,
    retry,
    sendText,
    stopAll,
  } = useVisionTurn(
    camera,
    () => camLive && device !== undefined,
    watch.frames,
  );

  function flip(): void {
    setCamLive(false);
    setCamProblem(null);
    setPosition((p) => (p === "back" ? "front" : "back"));
  }

  function exit(): void {
    stopAll();
    watch.stopWatch();
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
          cameraRef={camera}
          onReady={() => setCamLive(true)}
          onProblem={setCamProblem}
          onOpenSettings={goToSettings}
        />

        {camLive ? (
          <>
            <VisionTopFloat
              top={insets.top + 8}
              onExit={exit}
              onFlip={flip}
              watchOn={watch.watchOn}
              onToggleWatch={watch.toggleWatch}
              intervalMs={watch.intervalMs}
              onIntervalStep={(d) => watch.setWatchIntervalMs(watch.intervalMs + d)}
            />

            <VisionBottomPanel
              bottom={panelBottom}
              issue={issue ?? (visionOff ? "Vision is off for this model." : null)}
              issueAction={
                visionOff && issue === null
                  ? { label: "Open Models", onPress: () => router.navigate("/models") }
                  : null
              }
              needsSettings={needsSettings}
              onOpenSettings={goToSettings}
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
