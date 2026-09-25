/** Settings: voice output + web search today; more sections land here later. */

import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors } from "../themes/tokens.ts";
import { ScreenHeader } from "../components/ScreenHeader.tsx";
import { VoiceSettings } from "../components/VoiceSettings.tsx";
import { SearchSettings } from "../components/SearchSettings.tsx";

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
      </ScrollView>
    </SafeAreaView>
  );
}
