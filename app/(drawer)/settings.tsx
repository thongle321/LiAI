/** Settings: PocketPal's card set, in its order, in our tokens.
 *
 * Five cards, because the other three of PocketPal's eight have no home
 * here: App Settings loses all four of its rows (Language needs an i18n
 * layer this app does not have, Dark Mode is its own piece of work,
 * Text-to-speech and Display Memory Usage are excluded or impossible), so
 * it would render empty. Cache & Storage is a PocketPal Shortcuts cache
 * this app has no subject for. Export Options was excluded.
 *
 * There is deliberately NO storage card either: free space is reported on
 * the download cards themselves, where the size it is compared against is
 * (see hooks/useStorageDisclosure.ts).
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

import { colors, useColors } from "@/themes/tokens.ts";
import { ScreenHeader } from "@/components/screen-header.tsx";
import { ContentColumn } from "@/components/content-column.tsx";
import {
  MemorySettings,
  ModelInitializationSettings,
  ModelLoadingSettings,
} from "@/components/settings/inference-settings.tsx";
import { SearchSettings } from "@/components/settings/search-settings.tsx";
import { HfTokenSettings } from "@/components/settings/hf-token-settings.tsx";
import { AppSettings } from "@/components/settings/app-settings.tsx";

export default function SettingsScreen() {
  const colors = useColors();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.base }}>
      <ScreenHeader title="Settings" />
      <ScrollView
        className="flex-1"
        contentContainerClassName="w-full"
        automaticallyAdjustKeyboardInsets
        >
        <ContentColumn className="p-5">
          <ModelInitializationSettings />
          <MemorySettings />
          <ModelLoadingSettings />
          <SearchSettings />
          <HfTokenSettings />
          <AppSettings />
        </ContentColumn>
      </ScrollView>
    </SafeAreaView>
  );
}
