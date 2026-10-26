/** The voice tab's vision mode: full-screen live camera above the
 *  shared tab bar.
 *
 *  Extracted from app/(drawer)/(tabs)/vision.tsx when vision lost its
 *  third tab: it is now an in-screen mode of the voice tab (the Eye
 *  toggle), mounted by VoiceScreen while the router is on /voice —
 *  the bottom tab bar shows here exactly like on chat/voice. There is
 *  no exit route inside this mode: the caller passes `onExit` (back to
 *  the voice orb), which is the only way out besides the bar itself.
 *
 *  Top: exit (left), camera flip + VISION label (right) — no nav bar.
 *  Center: the live preview, never frozen, never covered except by the
 *  floats. Bottom: compact status area, big mic in the center, small
 *  keyboard button opening a floating input.
 *
 *  Question rule: one frame per question — snapshot-on-question. A voice
 *  or text question snapshots the CURRENT frame at ask time and sends it
 *  through the ordinary chat turn (no frame stream, no capture timer —
 *  the chat pipeline carries the image), then speaks the answer back.
 *  Watch mode (opt-in, 05) keeps a rolling buffer of recent frames so the
 *  next question can ride the window — still nothing is inferred until
 *  the user asks. The preview itself never freezes.
 */

import { useState, useEffect } from "react";
import { useRef } from "react";
import { View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useIsFocused } from "expo-router";
import { openSettings } from "expo-linking";
import { useCameraDevice, useCameraPermission } from "react-native-vision-camera";
import type { Camera as VisionCameraView } from "react-native-vision-camera";

import { colors, useColors } from "@/themes/tokens.ts";
import { useKeyboardStore } from "@/store/keyboard.ts";
import { VOICE_STATUS_LABEL } from "@/services/voice/voice-status.ts";
import { useVisionTurn } from "@/hooks/useVisionTurn.ts";
import { useWatchMode } from "@/hooks/useWatchMode.ts";
import { useModelReady } from "@/hooks/useModelReady.ts";
import { useModelStore } from "@/store/model-store";
import { cannotSeeKind } from "@/services/inference/mmproj.ts";
import {
  VisionBottomPanel,
  VisionPreview,
  VisionTopFloat,
} from "@/components/vision/vision-overlays.tsx";

export function VisionMode({ onExit }: { onExit: () => void }) {
  const colors = useColors();
  const [position, setPosition] = useState<"back" | "front">("back");
  const [camLive, setCamLive] = useState(false);
  const [camProblem, setCamProblem] = useState<string | null>(null);
  const [inputOpen, setInputOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const camera = useRef<VisionCameraView | null>(null);
  // No model: talk and type are disabled so the mic can't open a turn that
  // can never answer.
  const modelReady = useModelReady();
  // The engine's OWN verdict AND its split (services/inference/mmproj.ts
  // is the one owner; the send gate reads the same module). "Can't see"
  // becomes TWO notices:
  //  - a toggled-off flag with the projector on disk is fixable in Models —
  //    the "Vision is off for this model." card; the mic is greyed too,
  //    because a blind model cannot answer "what do you see?" even before
  //    the flag is fixed;
  //  - any other cannot-see (no projector paired, or a remote probe that
  //    recorded no vision) just is: grey the mic the way PocketPal disables
  //    its plus button instead of warning after the turn already went out.
  const models = useModelStore((s) => s.models);
  const remoteCaps = useModelStore((s) => s.remoteCaps);
  const activeModelId = useModelStore((s) => s.activeModelId);
  const activeProviderType = useModelStore(
    (s) => s.activeProviderType,
  );
  const cannotSee = cannotSeeKind({
    models,
    remoteCaps,
    activeModelId,
    activeProviderType,
  });
  // No-model-at-all keeps its own dead state here (grey mic, no notice):
  // the can't-see card only speaks when a model is loaded and still blind.
  const visionUnsupported = cannotSee === "noVision" && modelReady;
  const visionCard =
    cannotSee === "toggledOff"
      ? "Vision is off for this model."
      : visionUnsupported
        ? "This model can't see images."
        : null;
  const seesImages = cannotSee === "sees";

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
  // Android owns the permission prompt: entering this mode is the intent to
  // use the camera, so the system dialog is raised here instead of behind
  // an in-app button the user has to find. Re-entering after a denial asks
  // again (the OS allows that unless "don't ask again" was chosen), and a
  // permanently-denied user gets the Open settings path.
  // useCameraPermission re-checks on app foreground, so returning from
  // system settings lights the camera up with no extra plumbing.
  useEffect(() => {
    if (focused && !hasPermission) void requestPermission();
  }, [focused, hasPermission, requestPermission]);
  const insets = useSafeAreaInsets();
  // The tab bar owns the bottom inset ("applied once, at the bar") and —
  // PocketParity — stays MOUNTED while the keyboard opens, so the panel
  // anchors 12px above the bar top in BOTH keyboard states. The geometry no
  // longer carries a keyboard term at all: the keyboard simply covers the
  // bar and the panel's lower margin, which is what stops the jump the old
  // keyboardVisible compensation made.
  // What the panel DOES still do is rise with the keyboard, and its lift
  // must know how far off the physical screen bottom it rests: the bar's
  // slot (inset + measured height) plus its own 12px margin. Same store as
  // the chat screen (store/keyboard.ts): the bar's MEASURED height, not the
  // seed constant — the label scales with the OS font setting, so the real
  // bar can be taller than the class sum, and the anchor must track it or
  // the panel drifts when large text is on (see VisionBottomPanel).
  const tabBarHeight = useKeyboardStore((s) => s.tabBarHeight);
  const panelBottom = 12;
  const panelLiftAnchor = panelBottom + insets.bottom + tabBarHeight;
  // Two dead ends land on the same system screen: a denied camera and a
  // blocked mic. One handler for both.
  const goToSettings = () => void openSettings().catch(() => {});

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
    // Cleanup before handing back: recognizer, speech and the watch
    // buffer all die here; the unmount cleanup is the backstop.
    stopAll();
    watch.stopWatch();
    onExit();
  }

  function sendDraft(): void {
    if (draft.trim() === "") return;
    sendText(draft);
    setDraft("");
    setInputOpen(false);
  }

  return (
    // Top edge is padded so the overlays sit below the status bar instead of
    // overlapping it; the camera stays full-bleed on the sides and bottom.
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.base }}>
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
              top={8}
              onExit={exit}
              onFlip={flip}
              watchOn={watch.watchOn}
              onToggleWatch={watch.toggleWatch}
              intervalMs={watch.intervalMs}
              onIntervalStep={(d) => watch.setWatchIntervalMs(watch.intervalMs + d)}
            />

            <VisionBottomPanel
              bottom={panelBottom}
              liftAnchor={panelLiftAnchor}
              issue={issue ?? visionCard}
              issueAction={
                cannotSee === "toggledOff" && issue === null
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
              visionSupported={seesImages}
            />
          </>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
