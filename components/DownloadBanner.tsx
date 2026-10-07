/** Global download banner: one sticky row for any transfer in flight.
 *
 * PocketPal parity (DownloadOverlay.tsx:19-45, DownloadBanner.tsx:34-45) —
 * a download is app-wide state, so its progress belongs above the navigator
 * rather than only on the models screen. Otherwise a 4 GB pull looks like
 * nothing is happening once you leave that screen to chat.
 *
 * Data comes from the models array rather than a new store slice: progress
 * is already throttled to ~1 Hz at the emitter (download-service.ts), and
 * one small always-mounted component re-rendering once a second is not the
 * thing that made the app feel slow. Reach for a dedicated slice only if
 * this ever needs to be cheaper.
 */

import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { useModelStore } from "../store/modelStore";
import { formatBytes } from "./models/ModelBits";

export function DownloadBanner() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const models = useModelStore((s) => s.models);

  // Downloading only: a paused transfer is a state the user chose, and a
  // frozen bar nagging them about it is noise, not information.
  const active = models.filter((m) => m.downloadStatus === "downloading");
  if (active.length === 0) return null;

  const lead = active[0];
  const extra = active.length - 1;
  const pct = Math.min(100, Math.max(0, lead.downloadProgress));
  const speed = lead.speedBytesPerSec;

  return (
    <Pressable
      onPress={() => router.navigate("/models")}
      accessibilityRole="button"
      accessibilityLabel={`Downloading ${lead.name}, ${Math.round(pct)} percent. Open models.`}
      className="absolute left-0 right-0 top-0 border-b border-border bg-surface-1 px-4 pb-2 pt-2"
      style={{ paddingTop: insets.top + 8 }}
    >
      <View className="flex-row items-center justify-between">
        <Text className="flex-1 font-sans-semibold text-body-sm text-primary-text" numberOfLines={1}>
          {lead.name}
        </Text>
        <Text className="font-sans text-caption text-secondary-text">
          {speed !== undefined && speed > 0
            ? `${Math.round(pct)}% · ${formatBytes(speed)}/s`
            : `${Math.round(pct)}%`}
          {extra > 0 ? `  ·  +${extra} more` : ""}
        </Text>
      </View>
      <View className="mt-2 h-1 overflow-hidden rounded-full bg-surface-2">
        <View className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </View>
    </Pressable>
  );
}