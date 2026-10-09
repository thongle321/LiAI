/** Storage card: how much free space this device has.
 *
 * This row exists to make the download failure dialog's advice true — "Check
 * the free space reported in Settings" (lib/models/download-error.ts) used
 * to send the user to a screen with no figure on it. One row, read when the
 * screen is shown and re-read on demand; no usage breakdown and no cleanup
 * action, which is deliberately out of scope (spec, "Not doing").
 *
 * A failed read is a normal state, not a crash: the row says so and stays
 * put.
 */

import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { getFreeDiskStorageAsync } from "expo-file-system/legacy";
import { RefreshCw } from "lucide-react-native";

import { colors } from "../themes/tokens.ts";
import { freeSpaceLabel } from "../lib/models/free-space.ts";
import { RowLabel, SettingsSection } from "./SettingsRows.tsx";

export function StorageSettings() {
  // undefined = not read yet, null = read failed. Kept apart so the row does
  // not flash "Couldn't read storage" while the first read is in flight.
  const [free, setFree] = useState<number | null | undefined>(undefined);

  const refresh = useCallback(() => {
    getFreeDiskStorageAsync().then(setFree).catch(() => setFree(null));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <SettingsSection>
      <View className="row">
        <View className="flex-row items-center justify-between py-2">
          <RowLabel
            label="Free space"
            description="Space left on this device. Models download into it."
          />
          <View className="flex-row items-center gap-2">
            <Text className="font-sans text-body-md text-primary-text">
              {free === undefined ? "Reading…" : freeSpaceLabel(free)}
            </Text>
            <Pressable
              onPress={refresh}
              className="h-12 w-12 items-center justify-center rounded-full border border-border bg-surface-1"
              accessibilityRole="button"
              accessibilityLabel="Refresh free space"
            >
              <RefreshCw size={16} color={colors.primary} />
            </Pressable>
          </View>
        </View>
      </View>
    </SettingsSection>
  );
}
