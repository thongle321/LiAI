/** Settings: voice output today; more sections land here later. */

import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, spacing } from "../themes/tokens.ts";
import { ScreenHeader } from "../components/ScreenHeader.tsx";
import { VoiceSettings } from "../components/VoiceSettings.tsx";

export default function SettingsScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.base }}>
      <ScreenHeader title="Settings" />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: spacing.md }}
      >
        <VoiceSettings />
      </ScrollView>
    </SafeAreaView>
  );
}
