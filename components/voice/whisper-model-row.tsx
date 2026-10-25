/** A Whisper tier's identity + download state, for the setup sheets.
 *
 *  Ported from pocketpal-ai src/components/WhisperModelRow as LiAI's
 *  English copy over the asr store: the tier names/hints come from
 *  utils/asr-tier-label.ts, the failure line splits on WHY — the
 *  insufficient-storage code gets the storage line, everything else the
 *  plain failure. A downloading tier shows the transfer both as text
 *  ("X of Y") and as a bar.
 */

import { Text, View } from "react-native";

import { useColors } from "@/themes/tokens.ts";
import { formatBytes } from "@/services/models/progress.ts";
import { useAsrStore } from "@/store/asr.ts";
import {
  ASR_DISK_HEADROOM_FACTOR,
  ASR_INSUFFICIENT_STORAGE,
  ASR_TIERS,
} from "@/services/asr/constants.ts";
import { insufficientStorageCopy } from "@/services/asr/error-copy.ts";
import { ASR_TIER_LABEL } from "@/utils/asr-tier-label.ts";

/** One sheet-side row: title, "Whisper <tier> · <size>", status. */
export function WhisperModelRow({
  tier,
  testIDPrefix,
}: {
  tier: keyof typeof ASR_TIERS;
  testIDPrefix: string;
}) {
  const colors = useColors();
  const state = useAsrStore((s) => s.downloadStates[tier]);
  const progress = useAsrStore((s) => s.downloadProgress[tier]);
  const error = useAsrStore((s) => s.downloadError[tier]);
  const freeDiskBytes = useAsrStore((s) => s.freeDiskBytes);
  const bytes = ASR_TIERS[tier].estimatedBytes;
  const lowDisk = state === "error" && error === ASR_INSUFFICIENT_STORAGE;

  return (
    <View testID={`${testIDPrefix}-stt`}>
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="font-sans-semibold text-body-md text-primary-text">
            Speech recognition
          </Text>
          <Text className="mt-0.5 text-quiet">
            {`Whisper ${ASR_TIER_LABEL[tier]} · ${formatBytes(bytes, 0)}`}
          </Text>
        </View>
        {state === "ready" && (
          <Text className="font-sans text-body-sm text-primary">Installed</Text>
        )}
        {state === "downloading" && (
          <Text className="text-quiet">
            {`${formatBytes(bytes * progress, 0)} of ${formatBytes(bytes, 0)}`}
          </Text>
        )}
      </View>
      {state === "downloading" && (
        <View
          testID={`${testIDPrefix}-stt-progress`}
          className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-3"
          accessibilityRole="progressbar"
          accessibilityValue={{ now: Math.round(progress * 100), min: 0, max: 100 }}
        >
          <View
            className="h-full rounded-full bg-primary"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </View>
      )}
      {lowDisk && (
        <Text
          testID={`${testIDPrefix}-low-disk`}
          className="mt-1 font-sans text-body-sm text-error"
          accessibilityLiveRegion="polite"
        >
          {insufficientStorageCopy(
            bytes * ASR_DISK_HEADROOM_FACTOR,
            freeDiskBytes,
          )}
        </Text>
      )}
      {state === "error" && !lowDisk && (
        <Text
          className="mt-1 font-sans text-body-sm text-error"
          accessibilityLiveRegion="polite"
        >
          Download failed. Try again.
        </Text>
      )}
    </View>
  );
}
