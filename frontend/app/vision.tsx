/** Vision screen: camera frames + questions over /api/vision/ws.
 *
 * Renders the camera preview, the live caption list, and the question
 * box. Streaming (socket + snapshot loop) lives in hooks/useVisionStream.
 * Requires a dev-client build (not Expo Go).
 */

import { useRef, useState } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from "react-native-vision-camera";

import { useVisionStream } from "../hooks/useVisionStream.ts";

export default function VisionScreen() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice("back");
  const camera = useRef<Camera | null>(null);
  const ready = useRef(false);
  const { phase, problem, entries, captureStatus, sendQuestion, setProblem } =
    useVisionStream(camera, ready);
  const [draft, setDraft] = useState("");

  const canAsk = draft.trim() !== "" && phase === "open";

  async function ask(): Promise<void> {
    const text = draft.trim();
    if (text === "") return;
    setDraft("");
    await sendQuestion(text);
  }

  if (!hasPermission) {
    return (
      <SafeAreaView style={{ flex: 1 }} className="items-center justify-center bg-base">
        <Text className="px-8 text-center font-sans text-body-lg text-primary-text">Camera access is needed.</Text>
        <Pressable onPress={() => void requestPermission()} className="btn btn--primary mt-4">
          <Text className="font-sans-semibold text-on-primary">Grant access</Text>
        </Pressable>
        <Pressable onPress={() => router.back()} className="mt-2 px-4 py-2">
          <Text className="font-sans text-body-md text-primary">Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (!device) {
    return (
      <SafeAreaView style={{ flex: 1 }} className="items-center justify-center bg-base">
        <Text className="font-sans text-body-lg text-primary-text">No camera device found.</Text>
        <Pressable onPress={() => router.back()} className="mt-2 px-4 py-2">
          <Text className="font-sans text-body-md text-primary">Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0B0C0C" }}>
      {/* video required on iOS: takeSnapshot reads the video pipeline */}
      <Camera
        ref={camera}
        className="flex-1"
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
            <Text className="px-4 py-1 font-sans text-body-md text-primary-text">{item}</Text>
          )}
        />
      </View>
      <Text className="px-4 py-1 font-sans text-caption text-secondary-text">{captureStatus}</Text>
      {phase === "failed" && (
        <Text className="px-4 py-1 font-sans text-body-sm text-error">{problem}</Text>
      )}
      <View className="flex-row items-center border-t border-border bg-base px-4 py-2">
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Ask about what you see…"
          placeholderTextColor="#A1A1AA"
          className="input flex-1 font-sans"
        />
        <Pressable
          onPress={() => void ask()}
          disabled={!canAsk}
          className={`btn ml-2 ${canAsk ? "btn--primary" : "btn--secondary"}`}
        >
          <Text
            className={`font-sans-semibold ${
              canAsk ? "text-on-primary" : "text-secondary-text"
            }`}
          >
            Ask
          </Text>
        </Pressable>
      </View>
      <Pressable onPress={() => router.back()} className="items-center py-2">
        <Text className="font-sans text-body-md text-error">Close</Text>
      </Pressable>
    </SafeAreaView>
  );
}
