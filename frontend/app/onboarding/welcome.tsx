/** Onboarding 1/3 — welcome: what LiAI is. Content moved from app/index. */

import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Eye, MessageCircle, Mic, type LucideIcon } from "lucide-react-native";

import { colors } from "../../themes/tokens.ts";
import { APP_NAME } from "../../constants/app.ts";

const ROWS: { Icon: LucideIcon; title: string; body: string }[] = [
  { Icon: Eye, title: "See", body: "Point. Ask. Learn." },
  { Icon: MessageCircle, title: "Chat", body: "Talk it through." },
  { Icon: Mic, title: "Voice", body: "Tap to speak." },
];

export default function WelcomeStep() {
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
        <Pressable
          onPress={() => router.push("/onboarding/model")}
          className="btn btn--primary mt-8"
        >
          <Text className="text-center font-sans-semibold text-on-primary">
            Continue
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
