/** Settings: voice, search, on-device inference, and HF token. */

import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors } from "../themes/tokens.ts";
import { ScreenHeader } from "../components/ScreenHeader.tsx";
import { VoiceSettings } from "../components/VoiceSettings.tsx";
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
        <VoiceSettings />
        <SearchSettings />
        <InferenceSettings />
        <HfTokenSettings />
      </ScrollView>
    </SafeAreaView>
  );
}
