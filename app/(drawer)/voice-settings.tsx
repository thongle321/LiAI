/** Voice output settings live here (moved out of Settings).
 *
 * Same rows, models-style screen chrome: back header, no cards.
 */

import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors } from "../../themes/tokens.ts";
import { ScreenHeader } from "../../components/ScreenHeader.tsx";
import { ContentColumn } from "../../components/ContentColumn.tsx";
import { VoiceSettings } from "../../components/VoiceSettings.tsx";

export default function VoiceSettingsScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.base }}>
      <ScreenHeader title="Voice" />
      <ScrollView className="flex-1" contentContainerClassName="w-full">
        <ContentColumn className="p-5">
          <VoiceSettings />
        </ContentColumn>
      </ScrollView>
    </SafeAreaView>
  );
}
