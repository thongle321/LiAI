/** Settings: search and on-device inference.
 *
 * Voice lives on its own screen (app/voice-settings.tsx) and is reached
 * from the drawer, so there is no Voice row here.
 */

import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors } from "../themes/tokens.ts";
import { ScreenHeader } from "../components/ScreenHeader.tsx";
import { ContentColumn } from "../components/ContentColumn.tsx";
import { SearchSettings } from "../components/SearchSettings.tsx";
import { InferenceSettings } from "../components/InferenceSettings.tsx";
import { HfTokenSettings } from "../components/HfTokenSettings.tsx";

export default function SettingsScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.base }}>
      <ScreenHeader title="Settings" />
      <ScrollView className="flex-1" contentContainerClassName="w-full">
        <ContentColumn className="p-5">
          <SearchSettings />
          <InferenceSettings />
          <HfTokenSettings />
        </ContentColumn>
      </ScrollView>
    </SafeAreaView>
  );
}
