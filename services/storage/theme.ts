/** Appearance persistence key — read at startup (app/_layout.tsx, which
 *  re-applies it via Uniwind.setTheme before first paint) and written by
 *  the appearance control (components/settings/app-settings.tsx). Values:
 *  "system" | "light" | "dark". A missing key means "follow the system". */

import AsyncStorage from "@react-native-async-storage/async-storage";

export const THEME_KEY = "liai.theme";

export type StoredTheme = "system" | "light" | "dark";

export async function readStoredTheme(): Promise<StoredTheme | null> {
  try {
    const v = await AsyncStorage.getItem(THEME_KEY);
    return v === "system" || v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

export async function writeStoredTheme(theme: StoredTheme): Promise<void> {
  await AsyncStorage.setItem(THEME_KEY, theme);
}
