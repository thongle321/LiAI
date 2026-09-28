/** Settings: on-device inference, sampling, thinking, search, API keys.
 *
 * Voice lives on its own screen (app/voice-settings.tsx) and is reached
 * from the drawer, so there is no Voice row here. Order follows the
 * grouping a person actually reads in: what the model is, how it generates,
 * then what it can reach outside the device.
 */

import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors } from "../../themes/tokens.ts";
import { ScreenHeader } from "../../components/ScreenHeader.tsx";
import { ContentColumn } from "../../components/ContentColumn.tsx";
import { InferenceSettings, ThinkingSettings } from "../../components/InferenceSettings.tsx";
import { SamplingSettings } from "../../components/SamplingSettings.tsx";
import { SearchSettings } from "../../components/SearchSettings.tsx";
import { HfTokenSettings } from "../../components/HfTokenSettings.tsx";

export default function SettingsScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.base }}>
      <ScreenHeader title="Settings" />
      <ScrollView className="flex-1" contentContainerClassName="w-full">
        <ContentColumn className="p-5">
          <InferenceSettings />
          <SamplingSettings />
          <ThinkingSettings />
          <SearchSettings />
          <HfTokenSettings />
        </ContentColumn>
      </ScrollView>
    </SafeAreaView>
  );
}
