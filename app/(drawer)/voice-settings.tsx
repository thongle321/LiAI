/** Voice output settings live here (moved out of Settings).
 *
 * Same rows, models-style screen chrome: back header, no cards.
 */

import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, useColors } from "@/themes/tokens.ts";
import { ScreenHeader } from "@/components/screen-header.tsx";
import { ContentColumn } from "@/components/content-column.tsx";
import { VoiceSettings } from "@/components/settings/voice-settings.tsx";
import { AsrSetup } from "@/components/voice/asr-setup.tsx";

export default function VoiceSettingsScreen() {
  const colors = useColors();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.base }}>
      <ScreenHeader title="Voice" />
      <ScrollView
        className="flex-1"
        contentContainerClassName="w-full"
        automaticallyAdjustKeyboardInsets
        >
        <ContentColumn className="p-5">
          {/* Speech OUTPUT first (PocketPal's voice settings), speech INPUT
              second — the mic section is PocketPal's ASR settings surface
              (D7), arrived with the mic parity port. */}
          <VoiceSettings />
          <AsrSetup />
        </ContentColumn>
      </ScrollView>
    </SafeAreaView>
  );
}
