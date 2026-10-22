/** Settings: PocketPal's card set, in its order, in our tokens.
 *
 * Six cards. App Settings follows Model Loading, exactly where PocketPal
 * puts it, and now carries the one row we support — Dark Mode (Language
 * needs an i18n layer this app does not have; Text-to-speech lives on the
 * Voice screen; Display Memory Usage is excluded or impossible). Cache &
 * Storage is a PocketPal Shortcuts cache this app has no subject for, and
 * Export Options was excluded.
 *
 * There is deliberately NO storage card either: free space is reported on
 * the download cards themselves, where the size it is compared against is
 * (see hooks/useStorageDisclosure.ts).
 *
 * There is deliberately NO sampling card: sampling is per conversation and
 * lives in the chat screen's "Generation settings" sheet, which is where
 * PocketPal keeps it.
 *
 * Each card is titled (16/24 regular) and its dividers are inset 16px,
 * matching PocketPal's Card.Title + Card.Content anatomy in our tokens.
 *
 * Voice lives on its own screen (app/(drawer)/voice-settings.tsx), reached
 * from the drawer.
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
          <AppSettings />
          <SearchSettings />
          <HfTokenSettings />
        </ContentColumn>
      </ScrollView>
    </SafeAreaView>
  );
}
