/** Vision screen: camera frames + questions over /api/vision/ws.
 *
 * react-native-vision-camera preview with periodic takeSnapshot() reads
 * from the live preview buffer — no still-photo pipeline, no shutter
 * flicker. Snapshots go out as base64 frames; answers arrive as text.
 * Requires a dev-client build (not Expo Go).
 * Text chat stays in app/index. Wire shapes live in lib/vision.ts.
 */

import { useEffect, useRef, useState } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from "react-native-vision-camera";
import {
  deleteAsync,
  EncodingType,
  readAsStringAsync,
} from "expo-file-system/legacy";

import {
  frameMessage,
  parseServerMessage,
  questionMessage,
  visionSocketUrl,
} from "../lib/vision.ts";

export default function VisionScreen() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice("back");
  const camera = useRef<Camera | null>(null);
  const ready = useRef(false);
  const socket = useRef<WebSocket | null>(null);
  // PocketPal pattern: a slow capture must not overlap the next tick
  const capturing = useRef(false);
  const [phase, setPhase] = useState("connecting");
  const [problem, setProblem] = useState("");
  const [entries, setEntries] = useState<string[]>([]);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    const ws = new WebSocket(visionSocketUrl());
    socket.current = ws;
    ws.onerror = () => {
      setProblem("Could not reach the vision stream");
      setPhase("failed");
    };
    ws.onopen = () => setPhase("open");
    ws.onclose = (event: { code?: unknown; reason?: unknown }) => {
      socket.current = null;
      const code = typeof event.code === "number" ? event.code : "?";
      const reason = typeof event.reason === "string" ? event.reason : "";
      setProblem(`Vision stream closed (${code}${reason ? ` ${reason}` : ""})`);
      setPhase("failed");
    };
    ws.onmessage = (event: { data?: unknown }) => {
      const msg = parseServerMessage(event.data);
      if (msg.type === "answer") {
        setEntries((prev) => [...prev, msg.text]);
      } else if (msg.type === "caption") {
        setEntries((prev) => [...prev, `Live: ${msg.text}`]);
      } else if (msg.type === "error") {
        setProblem(msg.message);
      }
    };
    // Last skip reason logged, so a wedged capture can't go silent.
    // Transitions only — no per-tick spam.
    let lastSkip = "";
    const skip = (reason: string): void => {
      if (reason !== lastSkip) {
        lastSkip = reason;
        console.log(`[vision] capture skipped: ${reason}`);
      }
    };
    const timer = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        skip("socket not open");
        return;
      }
      const ref = camera.current;
      if (!ref) {
        skip("no camera ref");
        return;
      }
      if (!ready.current) {
        skip("camera not initialized");
        return;
      }
      if (capturing.current) {
        skip("previous capture still in flight");
        return;
      }
      lastSkip = "";
      capturing.current = true;
      // A snapshot promise that never settles would wedge the guard
      // forever — time out so the next tick retries.
      const timeout = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("snapshot timed out")), 5000);
      });
      void Promise.race([ref.takeSnapshot({ quality: 50 }), timeout])
        .then(async (snapshot) => {
          // VisionCamera returns a bare path; expo-file-system needs a URI.
          const uri = snapshot.path.startsWith("file://")
            ? snapshot.path
            : `file://${snapshot.path}`;
          try {
            const jpeg = await readAsStringAsync(uri, {
              encoding: EncodingType.Base64,
            });
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(frameMessage(jpeg));
            }
          } finally {
            await deleteAsync(uri, { idempotent: true }).catch(
              () => undefined,
            );
          }
        })
        .catch((e: unknown) => {
          const detail =
            typeof e === "object" && e !== null && "message" in e
              ? String((e as { message: unknown }).message)
              : String(e);
          console.error("[vision] snapshot failed", detail);
          setProblem(`Capture failed: ${detail}`);
        })
        .finally(() => {
          capturing.current = false;
        });
    }, 1000);
    return () => {
      clearInterval(timer);
      ws.close();
      socket.current = null;
    };
  }, []);

  async function ask(): Promise<void> {
    const text = draft.trim();
    const ws = socket.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || text === "") return;
    setDraft("");
    setEntries((prev) => [...prev, `You: ${text}`]);
    ws.send(questionMessage(text));
  }

  if (!hasPermission) {
    return (
      <SafeAreaView style={{ flex: 1 }} className="items-center justify-center">
        <Text className="px-8 text-center">Camera access is needed.</Text>
        <Pressable onPress={() => void requestPermission()} className="mt-4 px-4 py-2">
          <Text className="text-blue-500">Grant access</Text>
        </Pressable>
        <Pressable onPress={() => router.back()} className="mt-2 px-4 py-2">
          <Text className="text-blue-500">Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (!device) {
    return (
      <SafeAreaView style={{ flex: 1 }} className="items-center justify-center">
        <Text>No camera device found.</Text>
        <Pressable onPress={() => router.back()} className="mt-2 px-4 py-2">
          <Text className="text-blue-500">Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "black" }}>
      {/* video required on iOS: takeSnapshot reads the video pipeline */}
      <Camera
        ref={camera}
        style={{ flex: 1 }}
        device={device}
        isActive
        photo
        video
        onInitialized={() => {
          ready.current = true;
        }}
        onError={(e: { message?: unknown }) => {
          console.error("[vision] camera error", e.message);
          setProblem(`Camera error: ${String(e.message ?? e)}`);
        }}
      />
      <View className="max-h-40">
        <FlatList
          data={entries}
          keyExtractor={(_, i) => String(i)}
          renderItem={({ item }) => (
            <Text className="px-4 py-1 text-white">{item}</Text>
          )}
        />
      </View>
      {phase === "failed" && (
        <Text className="px-4 py-1 text-red-400">{problem}</Text>
      )}
      <View className="flex-row items-center px-4 py-2 border-t border-gray-700">
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Ask about what you see…"
          placeholderTextColor="#9ca3af"
          className="flex-1 text-white"
        />
        <Pressable
          onPress={() => void ask()}
          disabled={draft.trim() === "" || phase !== "open"}
          className="px-2 py-1"
        >
          <Text className="text-blue-400">Ask</Text>
        </Pressable>
      </View>
      <Pressable onPress={() => router.back()} className="items-center py-2">
        <Text className="text-red-400">Close</Text>
      </Pressable>
    </SafeAreaView>
  );
}
