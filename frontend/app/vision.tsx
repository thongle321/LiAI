/** Vision screen: camera frames + questions over /api/vision/ws.
 *
 * expo-camera interval snapshots (~1 fps, jpg/q0.5) go out as frames;
 * answers arrive as text. Works in Expo Go (no native WebRTC).
 * Text chat stays in app/index. Wire shapes live in lib/vision.ts.
 */

import { useEffect, useRef, useState } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";

import {
  frameMessage,
  parseServerMessage,
  questionMessage,
  visionSocketUrl,
} from "../lib/vision.ts";

export default function VisionScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView | null>(null);
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
    ws.onopen = () => setPhase("open");
    ws.onerror = () => {
      setProblem("Could not reach the vision stream");
      setPhase("failed");
    };
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
    const timer = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) return;
      const ref = camera.current;
      if (!ref || capturing.current) return;
      capturing.current = true;
      void ref
        .takePictureAsync({
          base64: true,
          // ponytail: no client resize API; q0.5 trims typical phones under the 2MB server cap
          quality: 0.5,
          imageType: "jpg",
          exif: false,
          // skipProcessing discarded on purpose: it drops the quality
          // pipeline, ships full-res frames, and the server rejects them
          shutterSound: false,
        })
        .then((photo) => {
          if (photo.base64 && ws.readyState === WebSocket.OPEN) {
            ws.send(frameMessage(photo.base64));
          }
        })
        .catch(() => undefined)
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

  if (!permission) {
    return (
      <SafeAreaView style={{ flex: 1 }} className="items-center justify-center">
        <Text>Requesting camera…</Text>
      </SafeAreaView>
    );
  }
  if (!permission.granted) {
    return (
      <SafeAreaView style={{ flex: 1 }} className="items-center justify-center">
        <Text className="px-8 text-center">Camera access is needed.</Text>
        <Pressable
          onPress={() => void requestPermission()}
          className="mt-4 px-4 py-2"
        >
          <Text className="text-blue-500">Grant access</Text>
        </Pressable>
        <Pressable onPress={() => router.back()} className="mt-2 px-4 py-2">
          <Text className="text-blue-500">Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "black" }}>
      {/* Q1: no shutter animation on continuous capture */}
      <CameraView ref={camera} style={{ flex: 1 }} facing="back" animateShutter={false} />
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
