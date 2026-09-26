/** Settings: search, on-device inference, HF token; voice has its own screen. */

import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ChevronRight, Mic } from "lucide-react-native";

import { colors } from "../themes/tokens.ts";
import { ScreenHeader } from "../components/ScreenHeader.tsx";
import { SearchSettings } from "../components/SearchSettings.tsx";
import { InferenceSettings } from "../components/InferenceSettings.tsx";
import { HfTokenSettings } from "../components/HfTokenSettings.tsx";

export default function SettingsScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.base }}>
      <ScreenHeader title="Settings" />
      <ScrollView
        className="flex-1"
        contentContainerClassName="p-4"
      >
        <Pressable
          onPress={() => router.push("/voice-settings")}
          className="mb-6 flex-row items-center justify-between py-2.5"
        >
          <View className="flex-row items-center gap-2.5">
            <Mic size={18} color={colors.primary} />
            <Text className="font-sans text-body-md text-primary-text">Voice</Text>
          </View>
          <ChevronRight size={18} color={colors.secondaryText} />
        </Pressable>
        <SearchSettings />
        <InferenceSettings />
        <HfTokenSettings />
      </ScrollView>
    </SafeAreaView>
  );
}
