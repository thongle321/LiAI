import { useCallback } from "react";
import { Text, View } from "react-native";
import { Uniwind, useUniwind } from "uniwind";

import { ToggleRow, SettingsSection } from "../settings-rows.tsx";
import { writeStoredTheme } from "@/services/storage/theme.ts";

/** App Settings card: appearance first (Dark mode), room for app-wide
 *  preferences below it. The toggle drives Uniwind's theme API, which
 *  flips every --color-* token in global.css AND syncs the native
 *  Appearance (so system dialogs and @expo/ui follow). The choice is
 *  persisted; app/_layout.tsx re-applies it on the next cold start.
 *
 *  The switch reads `theme` directly — no local mirror state. Uniwind is
 *  already the single source of truth, and a shadow `dark` boolean could
 *  drift from it if the theme changes anywhere else (a system-wide
 *  appearance change, another setTheme call). */
export function AppSettings() {
  const { theme } = useUniwind();
  const dark = theme === "dark";

  const toggle = useCallback(() => {
    const next = !dark;
    Uniwind.setTheme(next ? "dark" : "light");
    void writeStoredTheme(next ? "dark" : "light");
  }, [dark]);

  return (
    <View>
      <Text className="section-title mb-2">App Settings</Text>
      <SettingsSection description="Appearance and app-wide preferences.">
        <View className="row">
          <ToggleRow
            label="Dark mode"
            description="Switch the app between light and dark appearance."
            on={dark}
            onPress={toggle}
          />
        </View>
      </SettingsSection>
    </View>
  );
}
