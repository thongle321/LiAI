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
import { ProgressTrack, progressLabel } from "./models/ModelBits";

/** Stacked in normal flow above the navigator, NOT absolutely positioned.
 *
 * The review caught this as an overlay that covers each screen's header for
 * the whole transfer. Trading one layout shift when a download starts (and
 * one when it ends) for never hiding a header is the right way round: a
 * download runs for minutes, and a screen you cannot read is worse than a
 * screen that moved once. */
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
      className="border-b border-border bg-surface-1 px-4 pb-2 pt-2"
      style={{ paddingTop: insets.top + 8 }}
    >
      <View className="flex-row items-center justify-between">
        <Text className="flex-1 font-sans-semibold text-body-sm text-primary-text" numberOfLines={1}>
          {lead.name}
        </Text>
        <Text className="font-sans text-caption text-secondary-text">
          {progressLabel(pct, speed)}
          {extra > 0 ? `  ·  +${extra} more` : ""}
        </Text>
      </View>
      <View className="mt-2">
        <ProgressTrack progress={pct} />
      </View>
    </Pressable>
  );
}