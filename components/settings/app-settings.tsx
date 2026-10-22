import { useCallback } from "react";
import { Text, View } from "react-native";
import { Uniwind, useUniwind } from "uniwind";

import { Segmented, SettingsSection } from "../settings-rows.tsx";
import { writeStoredTheme, type StoredTheme } from "@/services/storage/theme.ts";

/** App Settings card: appearance first (System/Light/Dark), room for
 *  app-wide preferences below it. The control drives Uniwind's theme API,
 *  which flips every --color-* token in global.css AND syncs the native
 *  Appearance (so system dialogs and @expo/ui follow). The choice is
 *  persisted; app/_layout.tsx re-applies it on the next cold start.
 *
 *  `hasAdaptiveThemes === true` means "follow the system"; otherwise the
 *  explicit choice is `theme`. Uniwind is the single source of truth. */
export function AppSettings() {
  const { theme, hasAdaptiveThemes } = useUniwind();
  const preference: StoredTheme = hasAdaptiveThemes ? "system" : theme === "dark" ? "dark" : "light";

  const pick = useCallback((next: StoredTheme) => {
    Uniwind.setTheme(next);
    void writeStoredTheme(next);
  }, []);

  return (
    <View>
      <Text className="section-title mb-2">App Settings</Text>
      <SettingsSection description="Appearance and app-wide preferences.">
        <Segmented<StoredTheme>
          label="Appearance"
          description="Follow the system, or force light or dark."
          value={preference}
          options={["system", "light", "dark"]}
          displayFor={(v) => (v === "system" ? "System" : v === "light" ? "Light" : "Dark")}
          onPick={pick}
        />
      </SettingsSection>
    </View>
  );
}
