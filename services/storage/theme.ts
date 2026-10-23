/** Appearance persistence — PocketPal's explicit light/dark choice.
 *
 * `resolveInitialTheme` runs once at startup (app/_layout.tsx, which applies
 * the result via Uniwind.setTheme before first paint). A stored preference
 * wins; anything else (no key, a legacy "system" value, or a read failure)
 * is snapshotted from the OS once and written back, so a later launch never
 * follows the OS again. The card in components/settings/app-settings.tsx
 * writes the user's choice through `writeStoredTheme`.
 *
 * Collaborators are injected so the migration path is testable without
 * AsyncStorage or a device appearance.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Appearance, type ColorSchemeName } from "react-native";

export const THEME_KEY = "liai.theme";

export type StoredTheme = "light" | "dark";

export type ThemeDeps = {
  read: () => Promise<string | null>;
  write: (theme: StoredTheme) => Promise<void>;
  systemScheme: () => ColorSchemeName;
};

export function createThemePreference(deps: ThemeDeps) {
  async function readStoredTheme(): Promise<StoredTheme | null> {
    try {
      const value = await deps.read();
      return value === "light" || value === "dark" ? value : null;
    } catch {
      return null;
    }
  }

  /** The stored theme, or the OS scheme captured and persisted on first run. */
  async function resolveInitialTheme(): Promise<StoredTheme> {
    const stored = await readStoredTheme();
    if (stored !== null) return stored;

    const snapshot: StoredTheme =
      deps.systemScheme() === "dark" ? "dark" : "light";
    try {
      await deps.write(snapshot);
    } catch {
      // Unpersisted, but this launch still honours the snapshot.
    }
    return snapshot;
  }

  async function writeStoredTheme(theme: StoredTheme): Promise<void> {
    await deps.write(theme);
  }

  return { readStoredTheme, resolveInitialTheme, writeStoredTheme };
}

const preference = createThemePreference({
  read: () => AsyncStorage.getItem(THEME_KEY),
  write: (theme) => AsyncStorage.setItem(THEME_KEY, theme),
  // RN can report no scheme (e.g. while the activity is recreated); light is
  // the same fallback the old system-follow mode landed on.
  systemScheme: () => Appearance.getColorScheme() ?? "light",
});

export const { readStoredTheme, resolveInitialTheme, writeStoredTheme } =
  preference;
