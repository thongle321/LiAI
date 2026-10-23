/** Theme is PocketPal's explicit choice, not a system-follow mode.
 *
 * The contract this pins is the first-launch snapshot: a stored light/dark
 * preference wins, and anything else (no key, a legacy "system" value, or a
 * read failure) is resolved once from the OS and written back so the launch
 * after this one is deterministic. A write failure must not stop that launch.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  createThemePreference,
  readStoredTheme,
  THEME_KEY,
  writeStoredTheme,
  type StoredTheme,
} from "../theme.ts";

function fakeDeps(
  over: {
    stored?: string | null;
    failRead?: boolean;
    failWrite?: boolean;
    scheme?: "light" | "dark";
  } = {},
) {
  const writes: StoredTheme[] = [];
  const deps = {
    read: async () => {
      if (over.failRead === true) throw new Error("storage unavailable");
      return over.stored ?? null;
    },
    write: async (theme: StoredTheme) => {
      if (over.failWrite === true) throw new Error("storage unavailable");
      writes.push(theme);
    },
    systemScheme: (): "light" | "dark" => over.scheme ?? "light",
  };
  return { deps, writes };
}

describe("resolveInitialTheme", () => {
  it("honours a stored light or dark preference without touching the OS", async () => {
    for (const stored of ["light", "dark"] as const) {
      const { deps, writes } = fakeDeps({ stored, scheme: "dark" });
      await expect(
        createThemePreference(deps).resolveInitialTheme(),
      ).resolves.toBe(stored);
      expect(writes).toEqual([]);
    }
  });

  it("snapshots the OS scheme on first launch and persists it", async () => {
    const dark = fakeDeps({ scheme: "dark" });
    await expect(
      createThemePreference(dark.deps).resolveInitialTheme(),
    ).resolves.toBe("dark");
    expect(dark.writes).toEqual(["dark"]);

    const light = fakeDeps({ scheme: "light" });
    await expect(
      createThemePreference(light.deps).resolveInitialTheme(),
    ).resolves.toBe("light");
    expect(light.writes).toEqual(["light"]);
  });

  it("migrates a legacy system value to the snapshot", async () => {
    const { deps, writes } = fakeDeps({ stored: "system", scheme: "dark" });
    await expect(
      createThemePreference(deps).resolveInitialTheme(),
    ).resolves.toBe("dark");
    expect(writes).toEqual(["dark"]);
  });

  it("falls back to the snapshot when storage cannot be read", async () => {
    const { deps, writes } = fakeDeps({ failRead: true, scheme: "dark" });
    await expect(
      createThemePreference(deps).resolveInitialTheme(),
    ).resolves.toBe("dark");
    expect(writes).toEqual(["dark"]);
  });

  it("still applies the snapshot when it cannot be persisted", async () => {
    const { deps } = fakeDeps({ failWrite: true, scheme: "dark" });
    await expect(
      createThemePreference(deps).resolveInitialTheme(),
    ).resolves.toBe("dark");
  });

  it("treats an unknown stored value as unset", async () => {
    const { deps, writes } = fakeDeps({ stored: "sepia", scheme: "light" });
    await expect(
      createThemePreference(deps).resolveInitialTheme(),
    ).resolves.toBe("light");
    expect(writes).toEqual(["light"]);
  });
});

describe("live AsyncStorage wiring", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("writes and reads the preference through the real key", async () => {
    await writeStoredTheme("dark");
    await expect(AsyncStorage.getItem(THEME_KEY)).resolves.toBe("dark");
    await expect(readStoredTheme()).resolves.toBe("dark");
  });

  it("reads a legacy system value as unset", async () => {
    await AsyncStorage.setItem(THEME_KEY, "system");
    await expect(readStoredTheme()).resolves.toBeNull();
  });
});
