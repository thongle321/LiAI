import { useCallback } from "react";
import { View } from "react-native";
import { Moon } from "lucide-react-native";
import { Uniwind } from "uniwind";

import { SettingsSection, ToggleRow } from "../settings-rows.tsx";
import { useColorScheme, useColors } from "@/themes/tokens.ts";
import {
  writeStoredTheme,
  type StoredTheme,
} from "@/services/storage/theme.ts";

/** App Settings card: PocketPal's single Dark Mode row.
 *
 *  The switch drives Uniwind's theme API, which flips every --color-* token
 *  in global.css AND syncs native Appearance (system dialogs, @expo/ui).
 *  Uniwind is the single source of truth: "dark" is the whole preference,
 *  and app/_layout.tsx re-applies it before first paint on the next launch. */
export function AppSettings() {
  const scheme = useColorScheme();
  const colors = useColors();
  const dark = scheme === "dark";

  const setDark = useCallback((next: boolean) => {
    const choice: StoredTheme = next ? "dark" : "light";
    Uniwind.setTheme(choice);
    // The switch has already moved; a failed write only costs the preference
    // on the next launch, so it must not surface or block this one.
    void writeStoredTheme(choice).catch(() => {});
  }, []);

  return (
    <SettingsSection title="App Settings">
      <View className="row row--titled row--last">
        <ToggleRow
          label="Dark Mode"
          icon={<Moon size={20} color={colors.secondaryText} />}
          on={dark}
          onPress={() => setDark(!dark)}
        />
      </View>
    </SettingsSection>
  );
}
