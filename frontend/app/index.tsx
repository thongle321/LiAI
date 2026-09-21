/** First-run welcome. Sets a versioned flag and replaces to /chat.
 *
 * Returning launches skip straight to chat. Tokens, Raleway scale,
 * and Lucide icons only — no new assets.
 */

import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect, router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Eye, MessageCircle, Mic, type LucideIcon } from "lucide-react-native";

import { colors } from "../themes/tokens.ts";
import { APP_NAME } from "../constants/app.ts";

export const ONBOARDED_KEY = "liai_onboarded_v1";

const ROWS: { Icon: LucideIcon; title: string; body: string }[] = [
  { Icon: Eye, title: "See", body: "Point. Ask. Learn." },
  { Icon: MessageCircle, title: "Chat", body: "Talk it through." },
  { Icon: Mic, title: "Voice", body: "Tap to speak." },
];

export default function OnboardingScreen() {
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    void AsyncStorage.getItem(ONBOARDED_KEY).then((flag) => {
      setOnboarded(flag === "1");
    });
  }, []);

  async function begin(): Promise<void> {
    await AsyncStorage.setItem(ONBOARDED_KEY, "1");
    router.replace("/chat");
  }

  if (onboarded === null) return null;
  if (onboarded) return <Redirect href="/chat" />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.base }}>
      <View className="flex-1 justify-center px-8">
        <Text className="text-center font-sans-semibold text-h1 text-primary">
          {APP_NAME}
        </Text>
        <Text className="mt-2 text-center font-sans text-body-lg text-secondary-text">
          Your AI companion.{"\n"}The world is more interesting when you can ask.
        </Text>
        <View className="mt-8">
          {ROWS.map((r) => (
            <View key={r.title} className="mb-3 flex-row items-center rounded-card border border-border bg-surface-1 p-4">
              <r.Icon size={22} color={colors.primary} />
              <View className="ml-3">
                <Text className="font-sans-semibold text-body-md text-primary-text">
                  {r.title}
                </Text>
                <Text className="font-sans text-body-sm text-secondary-text">
                  {r.body}
                </Text>
              </View>
            </View>
          ))}
        </View>
        <Pressable onPress={() => void begin()} className="btn btn--primary mt-8">
          <Text className="text-center font-sans-semibold text-on-primary">
            Get started
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
