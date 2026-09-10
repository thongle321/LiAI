/** Realtime call screen (dev-client builds only — needs native WebRTC).
 *
 * Joins the Stream call minted by POST /api/realtime/token with the
 * local camera on and microphone off (voice is a later slice).
 * Questions go out as `liai.question` call events; `liai.answer`
 * events from the agent render as text. Text chat stays in app/index.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import {
  CallContent,
  StreamCall,
  StreamVideo,
  StreamVideoClient,
  type Call,
} from "@stream-io/video-react-native-sdk";

import { QuestionBar } from "../components/QuestionBar.tsx";
import { getRealtimeToken } from "../lib/api.ts";
import type { ApiError } from "../types/api.ts";

type CallPhase = "joining" | "joined" | "failed";

function problemMessage(err: unknown): string {
  if (err !== null && typeof err === "object" && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message !== "") return message;
  }
  if (err instanceof Error && err.message !== "") return err.message;
  return "Could not join the call";
}

export default function CallScreen() {
  const [client, setClient] = useState<StreamVideoClient | null>(null);
  const [call, setCall] = useState<Call | null>(null);
  const [phase, setPhase] = useState<CallPhase>("joining");
  const [problem, setProblem] = useState("");
  const [answer, setAnswer] = useState("");
  const showAnswer = useCallback((text: string) => setAnswer(text), []);

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let cancelled = false;
    let liveClient: StreamVideoClient | null = null;
    let liveCall: Call | null = null;

    async function start(): Promise<void> {
      try {
        const t = await getRealtimeToken();
        if (t.api_key === "") {
          const missing: ApiError = {
            code: "internal_error",
            message: "Realtime not configured",
          };
          throw missing;
        }
        liveClient = new StreamVideoClient({
          apiKey: t.api_key,
          user: { id: t.user_id, name: "LiAI" },
          token: t.token,
        });
        liveCall = liveClient.call("default", t.call_id);
        await liveCall.join();
        await liveCall.camera.enable();
        await liveCall.microphone.disable();
        if (cancelled) {
          await liveCall.leave().catch(() => undefined);
          return;
        }
        setClient(liveClient);
        setCall(liveCall);
        setPhase("joined");
      } catch (err) {
        if (!cancelled) {
          setProblem(problemMessage(err));
          setPhase("failed");
        }
      }
    }
    void start();

    return () => {
      cancelled = true;
      const c = liveCall;
      const cl = liveClient;
      if (c) {
        void c
          .leave()
          .catch(() => undefined)
          .then(() => cl?.disconnectUser());
      } else {
        cl?.disconnectUser();
      }
    };
  }, []);

  async function leave(): Promise<void> {
    setClient(null);
    setCall(null);
    router.back();
  }

  if (!client || !call || phase !== "joined") {
    return (
      <SafeAreaView
        style={{ flex: 1 }}
        className="items-center justify-center bg-black"
      >
        {phase === "failed" ? (
          <>
            <Text className="px-8 text-center text-white">{problem}</Text>
            <Pressable onPress={() => router.back()} className="mt-4 px-4 py-2">
              <Text className="text-blue-400">Back</Text>
            </Pressable>
          </>
        ) : (
          <Text className="text-white">Joining…</Text>
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1 }} className="bg-black">
      <StreamVideo client={client}>
        <StreamCall call={call}>
          <View className="flex-1">
            <CallContent />
            {answer !== "" && (
              <Text className="px-4 py-2 text-white">{answer}</Text>
            )}
            <QuestionBar onAnswer={showAnswer} />
            <Pressable
              onPress={() => void leave()}
              className="items-center py-2"
            >
              <Text className="text-red-400">Leave</Text>
            </Pressable>
          </View>
        </StreamCall>
      </StreamVideo>
    </SafeAreaView>
  );
}
