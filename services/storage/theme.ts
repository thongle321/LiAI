/** Appearance persistence key — read at startup (app/_layout.tsx, which
 *  re-applies it via Uniwind.setTheme before first paint) and written by
 *  the Dark mode toggle (components/settings/app-settings.tsx). Values:
 *  "light" | "dark". A missing key means "follow the system". */

import AsyncStorage from "@react-native-async-storage/async-storage";

export const DARK_MODE_KEY = "liai.theme";

export type StoredTheme = "light" | "dark";

export async function readStoredTheme(): Promise<StoredTheme | null> {
  try {
    const v = await AsyncStorage.getItem(DARK_MODE_KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

export async function writeStoredTheme(theme: StoredTheme): Promise<void> {
  await AsyncStorage.setItem(DARK_MODE_KEY, theme);
}
