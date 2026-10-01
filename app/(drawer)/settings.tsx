/** Settings: PocketPal's card set, in its order, in our tokens.
 *
 * Five cards, because the other three of PocketPal's eight have no home
 * here: App Settings loses all four of its rows (Language needs an i18n
 * layer this app does not have, Dark Mode is its own piece of work,
 * Text-to-speech and Display Memory Usage are excluded or impossible), so
 * it would render empty. Cache & Storage is a PocketPal Shortcuts cache
 * this app has no subject for. Export Options was excluded.
 *
 * There is deliberately NO sampling card: sampling is per conversation and
 * lives in the chat screen's "Generation settings" sheet, which is where
 * PocketPal keeps it.
 *
 * Voice lives on its own screen (app/voice-settings.tsx), reached from
 * the drawer.
 */

import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors } from "../../themes/tokens.ts";
import { ScreenHeader } from "../../components/ScreenHeader.tsx";
import { ContentColumn } from "../../components/ContentColumn.tsx";
import {
  MemorySettings,
  ModelInitializationSettings,
  ModelLoadingSettings,
} from "../../components/InferenceSettings.tsx";
import { SearchSettings } from "../../components/SearchSettings.tsx";
import { HfTokenSettings } from "../../components/HfTokenSettings.tsx";

export default function SettingsScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.base }}>
      <ScreenHeader title="Settings" />
      <ScrollView className="flex-1" contentContainerClassName="w-full">
        <ContentColumn className="p-5">
          <ModelInitializationSettings />
          <MemorySettings />
          <ModelLoadingSettings />
          <SearchSettings />
          <HfTokenSettings />
        </ContentColumn>
      </ScrollView>
    </SafeAreaView>
  );
}
