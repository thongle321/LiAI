/** ONE persistent bottom interaction panel: composer + expanding vision.
 *
 * Modes: chat (compact dock), vision (preview + silent live stream).
 * The composer mic dictates into the draft (you press Send); the
 * Voice tab opens the standalone /voice hands-free screen. The message list always stays visible above;
 * nothing else navigates away. Vision streams frames while expanded
 * (captions land in the backend log, nothing renders in the app).
 * Capture snapshots the preview and attaches a JPEG data-uri; sending
 * lives in the screen + store.
 */

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { Image as RNImage, Pressable, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Camera as CameraIcon, Mic, Plus, Send, X } from "lucide-react-native";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  type Camera as VisionCameraView,
} from "react-native-vision-camera";

import { colors } from "../themes/tokens.ts";
import { BottomNav, type ChatTab } from "./BottomNav.tsx";
import { mergeDictation, VOICE_LISTEN_OPTS } from "../lib/voiceListen.ts";
import { useVisionStream } from "../hooks/useVisionStream.ts";
import { snapshotToBase64 } from "../lib/snapshot.ts";

const MODE_LABEL: Record<ChatTab, string> = {
  chat: "Type a message…",
  voice: "Listening…",
  vision: "Ask LiAI about this",
};

export function InteractionPanel({
  sending,
  onSend,
}: {
  sending: boolean;
  onSend: (text: string, image?: string) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<ChatTab>("chat");
  const [draft, setDraft] = useState("");
  const [attachment, setAttachment] = useState<string | null>(null);
  const [plusOpen, setPlusOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [camProblem, setCamProblem] = useState<string | null>(null);
  const [camLive, setCamLive] = useState(false);
  // Dictation: mic fills the draft, the user presses Send. Interim
  // updates replace the dictated tail (draftBase keeps typed text).
  const [listening, setListening] = useState(false);
  const [voiceIssue, setVoiceIssue] = useState<string | null>(null);
  const draftBase = useRef("");

  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice("back");
  const camera = useRef<Camera | null>(null);
  const ready = useRef(false);

  // ponytail: the native module is absent when the dev build predates
  // the dep — stop() then throws, so never let it take down the caller.
  function safeStopDictation(): void {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      // nothing live to stop
    }
  }

  async function toggleDictation(): Promise<void> {
    if (listening) {
      safeStopDictation();
      return;
    }
    try {
      const res = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!res.granted) {
        setVoiceIssue("Microphone access is needed.");
        return;
      }
      draftBase.current = draft;
      setVoiceIssue(null);
      ExpoSpeechRecognitionModule.start({
        ...VOICE_LISTEN_OPTS,
      });
    } catch {
      setVoiceIssue("Voice input isn't available in this build — rebuild the dev client.");
    }
  }

  useSpeechRecognitionEvent("start", () => setListening(true));
  useSpeechRecognitionEvent("end", () => setListening(false));
  useSpeechRecognitionEvent("result", (event) => {
    const text = event.results[0]?.transcript ?? "";
    if (text === "") return;
    setDraft(mergeDictation(draftBase.current, text));
  });
  useSpeechRecognitionEvent("error", (event) => {
    if (event.error === "aborted") return; // our own stop()
    setVoiceIssue(
      event.error === "not-allowed"
        ? "Microphone access is needed."
        : "Didn't catch that.",
    );
  });

  useEffect(() => {
    return () => {
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {
        // shutting down anyway
      }
    };
  }, []);

  function selectTab(next: ChatTab): void {
    setPlusOpen(false);
    if (next !== "vision") setCamLive(false);
    setMode((m) => (m === next && next !== "chat" ? "chat" : next));
  }

  const canSend = !sending && draft.trim() !== "";

  async function handleSend(): Promise<void> {
    safeStopDictation();
    if (await onSend(draft, attachment ?? undefined)) {
      setDraft("");
      setAttachment(null);
    }
  }

  async function capture(): Promise<void> {
    const cam = camera.current;
    // Gate: snapshot on a zero-size/uninitialized preview throws
    // "width and height must be > 0" — wait for onInitialized.
    if (cam === null || capturing || !camLive) return;
    setCapturing(true);
    setCamProblem(null);
    try {
      const jpeg = await snapshotToBase64(() => cam.takeSnapshot({ quality: 50 }));
      setAttachment(`data:image/jpeg;base64,${jpeg}`);
      setMode("chat");
    } catch (e: unknown) {
      setCamProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setCapturing(false);
    }
  }

  return (
    <View className="border-t border-border bg-base">
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
          {camProblem !== null && (
            <Text className="mt-2 text-center font-sans text-body-sm text-secondary-text">
              {camProblem}
            </Text>
          )}
          {hasPermission && device !== undefined && mode === "vision" && (
            <VisionStream camera={camera} ready={ready} />
          )}
        </View>
      )}

      {attachment !== null && (
        <View className="mx-4 mb-1 flex-row items-center rounded-card border border-border bg-surface-1 p-2">
          <RNImage source={{ uri: attachment }} className="h-12 w-12 rounded-lg" />
          <Text className="ml-2 flex-1 font-sans text-body-sm text-secondary-text">
            Photo attached
          </Text>
          <Pressable onPress={() => setAttachment(null)} className="px-2 py-1">
            <X size={18} color={colors.secondaryText} />
          </Pressable>
        </View>
      )}

      {voiceIssue !== null && (
        <Text className="px-5 pb-1 font-sans text-body-sm text-secondary-text">
          {voiceIssue}
        </Text>
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
                onPress={() => selectTab("vision")}
              />
              <PlusItem label="Speak" onPress={() => router.push("/voice")} />
            </View>
          )}
        </View>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={MODE_LABEL[mode]}
          placeholderTextColor={colors.secondaryText}
          multiline
          editable={!sending}
          onSubmitEditing={() => void handleSend()}
          className="flex-1 px-3 font-sans text-body-md text-primary-text"
        />
        <Pressable onPress={() => void toggleDictation()} className="px-1 py-1">
          <Mic size={22} color={listening ? colors.primary : colors.secondaryText} />
        </Pressable>
        <Pressable disabled={!canSend} onPress={() => void handleSend()} className="px-2 py-1">
          <Send size={22} color={canSend ? colors.primary : colors.secondaryText} />
        </Pressable>
      </View>

      <BottomNav active={mode} onSelect={(t) => (t === "voice" ? router.push("/voice") : selectTab(t))} />
    </View>
  );
}

/** Silent live stream: same socket + 1s tick as before, but renders
 * nothing — captions land in the backend log. Mounts only while vision
 * is expanded, so the socket connects on open and closes on collapse. */
function VisionStream({
  camera,
  ready,
}: {
  camera: RefObject<VisionCameraView | null>;
  ready: RefObject<boolean>;
}) {
  useVisionStream(camera, ready);
  return null;
}

function PlusItem({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="px-4 py-2">
      <Text className="font-sans text-body-md text-primary-text">{label}</Text>
    </Pressable>
  );
}
