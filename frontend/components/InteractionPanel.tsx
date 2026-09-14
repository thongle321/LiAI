/** ONE persistent bottom interaction panel: composer + expanding voice/vision.
 *
 * Modes: chat (compact dock), voice (Listening + Stop), vision (live
 * preview + Capture), more (New conversation + Coming soon). The message
 * list always stays visible above; nothing navigates away. Voice is
 * visual-only — no audio deps. Capture snapshots the live preview and
 * hands a JPEG data-uri up; sending/wiring lives in the screen + store.
 */

import { useRef, useState } from "react";
import { Image as RNImage, Pressable, Text, TextInput, View } from "react-native";
import { AudioWaveform, Camera as CameraIcon, Mic, Plus, Send, Square, X } from "lucide-react-native";
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from "react-native-vision-camera";
import { deleteAsync, EncodingType, readAsStringAsync } from "expo-file-system/legacy";

import { colors } from "../themes/tokens.ts";
import { BottomNav, type ChatTab } from "./BottomNav.tsx";
import { useVisionStream } from "../hooks/useVisionStream.ts";

export type PanelMode = ChatTab;

const MODE_LABEL: Record<PanelMode, string> = {
  chat: "Type a message…",
  voice: "Listening…",
  vision: "Ask LiAI about this",
  more: "More",
};

export function InteractionPanel({
  draft,
  setDraft,
  canSend,
  sending,
  onSend,
  attachment,
  onRemoveAttachment,
  onCapture,
  onNewConversation,
}: {
  draft: string;
  setDraft: (s: string) => void;
  canSend: boolean;
  sending: boolean;
  onSend: () => void;
  attachment: string | null;
  onRemoveAttachment: () => void;
  onCapture: (dataUri: string) => void;
  onNewConversation: () => void;
}) {
  const [mode, setMode] = useState<PanelMode>("chat");
  const [plusOpen, setPlusOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [camProblem, setCamProblem] = useState<string | null>(null);
  const [camLive, setCamLive] = useState(false);

  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice("back");
  const camera = useRef<Camera | null>(null);
  const ready = useRef(false);

  function pick(mode: PanelMode): void {
    setPlusOpen(false);
    if (mode !== "vision") setCamLive(false);
    setMode((m) => (m === mode && mode !== "chat" ? "chat" : mode));
  }

  async function capture(): Promise<void> {
    const cam = camera.current;
    // Gate: snapshot on a zero-size/uninitialized preview throws
    // "width and height must be > 0" — wait for onInitialized.
    if (cam === null || capturing || !ready.current || !camLive) return;
    setCapturing(true);
    setCamProblem(null);
    try {
      const timeout = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("snapshot timed out")), 5000);
      });
      const snapshot = await Promise.race([cam.takeSnapshot({ quality: 50 }), timeout]);
      const uri = snapshot.path.startsWith("file://")
        ? snapshot.path
        : `file://${snapshot.path}`;
      try {
        const jpeg = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
        onCapture(`data:image/jpeg;base64,${jpeg}`);
        setMode("chat");
      } finally {
        await deleteAsync(uri, { idempotent: true }).catch(() => undefined);
      }
    } catch (e: unknown) {
      setCamProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setCapturing(false);
    }
  }

  return (
    <View className="border-t border-border bg-base">
      {mode === "voice" && (
        <View className="items-center px-4 pb-2 pt-5">
          <AudioWaveform size={48} color={colors.primary} />
          <Text className="mt-3 font-sans text-body-md text-secondary-text">
            Listening…
          </Text>
          <Pressable
            onPress={() => setMode("chat")}
            className="mt-4 items-center"
          >
            <View className="h-12 w-12 items-center justify-center rounded-full border border-error">
              <Square size={16} color={colors.error} />
            </View>
            <Text className="mt-1 font-sans text-body-sm text-secondary-text">
              Stop
            </Text>
          </Pressable>
        </View>
      )}

      {mode === "vision" && (
        <View className="px-4 pb-2 pt-4">
          <Text className="text-center font-sans-semibold text-body-md text-primary-text">
            LIVE CAMERA
          </Text>
          {!hasPermission ? (
            <View className="mt-3 items-center">
              <Text className="text-center font-sans text-body-md text-secondary-text">
                Camera access is needed.
              </Text>
              <Pressable
                onPress={() => void requestPermission()}
                className="btn btn--primary mt-3"
              >
                <Text className="font-sans-semibold text-on-primary">Grant access</Text>
              </Pressable>
            </View>
          ) : device === undefined ? (
            <Text className="mt-3 text-center font-sans text-body-md text-secondary-text">
              No camera device found.
            </Text>
          ) : (
            <View className="mt-3 overflow-hidden rounded-card border border-border">
              <Camera
                ref={camera}
                style={{ height: 220 }}
                device={device}
                isActive={mode === "vision"}
                photo
                video
                onInitialized={() => {
                  ready.current = true;
                  setCamLive(true);
                }}
                onError={(e: { message?: unknown }) =>
                  setCamProblem(`Camera error: ${String(e.message ?? e)}`)
                }
              />
            </View>
          )}
          <Text className="mt-3 text-center font-sans text-body-sm text-secondary-text">
            Ask LiAI about this
          </Text>
          {camProblem !== null && (
            <Text className="mt-1 text-center font-sans text-body-sm text-error">
              {camProblem}
            </Text>
          )}
          <Pressable
            onPress={() => void capture()}
            disabled={!hasPermission || device === undefined || capturing || !camLive}
            className="mt-2 items-center"
          >
            <View
              className={`h-12 w-12 items-center justify-center rounded-full border ${
                capturing ? "border-border" : "border-primary"
              }`}
            >
              <CameraIcon
                size={20}
                color={capturing ? colors.secondaryText : colors.primary}
              />
            </View>
            <Text className="mt-1 font-sans text-body-sm text-secondary-text">
              {capturing ? "Capturing…" : camLive ? "Capture" : "Starting camera…"}
            </Text>
          </Pressable>
          {device !== undefined && (
            <VisionLive camera={camera} ready={ready} />
          )}
        </View>
      )}

      {mode === "more" && (
        <View className="px-4 pb-2 pt-4">
          <Pressable onPress={() => { onNewConversation(); setMode("chat"); }} className="btn btn--primary">
            <Text className="font-sans-semibold text-on-primary">New conversation</Text>
          </Pressable>
          <Text className="mt-2 text-center font-sans text-body-sm text-secondary-text">
            More tools coming soon.
          </Text>
        </View>
      )}

      {attachment !== null && (
        <View className="mx-4 mb-1 flex-row items-center rounded-card border border-border bg-surface-1 p-2">
          <RNImage source={{ uri: attachment }} style={{ width: 48, height: 48, borderRadius: 8 }} />
          <Text className="ml-2 flex-1 font-sans text-body-sm text-secondary-text">
            Photo attached
          </Text>
          <Pressable onPress={onRemoveAttachment} className="px-2 py-1">
            <X size={18} color={colors.secondaryText} />
          </Pressable>
        </View>
      )}

      <View className="mx-4 mb-2 flex-row items-center rounded-full border border-border bg-surface-1 px-2 py-1">
        <View>
          <Pressable
            onPress={() => setPlusOpen((o) => !o)}
            className="h-9 w-9 items-center justify-center rounded-full border border-border"
          >
            <Plus size={22} color={colors.primary} />
          </Pressable>
          {plusOpen && (
            <View className="absolute bottom-11 left-0 w-40 rounded-card border border-border bg-surface-1 py-1">
              <PlusItem
                label="Take photo"
                onPress={() => pick("vision")}
              />
              <PlusItem label="Speak" onPress={() => pick("voice")} />
            </View>
          )}
        </View>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={MODE_LABEL[mode]}
          placeholderTextColor="#A1A1AA"
          multiline
          editable={!sending}
          onSubmitEditing={onSend}
          className="flex-1 px-3 font-sans text-body-md text-primary-text"
        />
        <Pressable onPress={() => pick("voice")} className="px-1 py-1">
          <Mic
            size={22}
            color={mode === "voice" ? colors.primary : colors.secondaryText}
          />
        </Pressable>
        <Pressable disabled={!canSend} onPress={onSend} className="px-2 py-1">
          <Send size={22} color={canSend ? colors.primary : colors.secondaryText} />
        </Pressable>
      </View>

      <BottomNav active={mode} onSelect={pick} />
    </View>
  );
}

import type { RefObject } from "react";
import type { Camera as VisionCameraView } from "react-native-vision-camera";

/** Live captions under the panel preview. Mounts only while vision is
 * expanded, so the socket connects on open and closes on collapse. */
function VisionLive({
  camera,
  ready,
}: {
  camera: RefObject<VisionCameraView | null>;
  ready: RefObject<boolean>;
}) {
  const { phase, problem, entries, captureStatus } = useVisionStream(camera, ready);
  const tail = entries.slice(-3);
  return (
    <View className="mt-2 rounded-card border border-border bg-surface-1 px-3 py-2">
      {tail.map((e, i) => (
        <Text key={`${tail.length}-${i}`} className="font-sans text-body-sm text-primary-text">
          {e}
        </Text>
      ))}
      <Text className="mt-1 font-sans text-caption text-secondary-text">
        {phase === "failed" ? problem : captureStatus}
      </Text>
    </View>
  );
}

function PlusItem({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="px-4 py-2">
      <Text className="font-sans text-body-md text-primary-text">{label}</Text>
    </Pressable>
  );
}
