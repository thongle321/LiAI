/** Voice-input (ASR) setup: the mic's availability + the tier downloads,
 *  riding the Voice settings screen under TTS (D7 — PocketPal's ASR
 *  settings surface). Availability is a plain ON/OFF toggle over the
 *  persisted tri-state: OFF and ON are explicit overrides; toggling is
 *  how the user says they want a side of the device default. Tier rows
 *  carry PocketPal's tier copy, download/remove CTAs and the storage
 *  denial wording. */

import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import { Download, Trash2 } from "lucide-react-native";

import { useColors } from "@/themes/tokens.ts";
import { cn } from "@/utils/cn.ts";
import { formatBytes } from "@/services/models/progress.ts";
import { useFreeSpacePoll } from "@/hooks/useStorageDisclosure.ts";
import { SettingsSection, ToggleRow } from "@/components/settings-rows.tsx";
import { RadioDot } from "@/components/voice/radio-dot.tsx";
import { useAsrStore } from "@/store/asr.ts";
import {
  ASR_DISK_HEADROOM_FACTOR,
  ASR_INSUFFICIENT_STORAGE,
  ASR_TIER_ORDER,
  ASR_TIERS,
} from "@/services/asr/constants.ts";
import {
  insufficientStorageCopy,
} from "@/services/asr/error-copy.ts";
import type { AsrTier } from "@/services/asr/types.ts";

/** Human tier names — PocketPal's tier* strings, verbatim. */
const TIER_LABEL: Record<AsrTier, string> = {
  base: "Base (multilingual, smallest)",
  small: "Small (recommended)",
  "large-turbo": "Large Turbo (best quality)",
};

function TierCard({ tier }: { tier: AsrTier }) {
  const colors = useColors();
  const manifest = ASR_TIERS[tier];
  const selected = useAsrStore((s) => s.selectedTier === tier);
  const state = useAsrStore((s) => s.downloadStates[tier]);
  const progress = useAsrStore((s) => s.downloadProgress[tier]);
  const error = useAsrStore((s) => s.downloadError[tier]);
  const setSelectedTier = useAsrStore((s) => s.setSelectedTier);
  const deleteModel = useAsrStore((s) => s.deleteModel);
  const downloadModel = useAsrStore((s) => s.downloadModel);
  const freeDiskBytes = useAsrStore((s) => s.freeDiskBytes);
  const installed = state === "ready";
  const downloading = state === "downloading";
  const failed = state === "error";

  return (
    <Pressable
      onPress={installed ? () => setSelectedTier(tier) : undefined}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={TIER_LABEL[tier]}
      className={cn("voice-card", selected && "voice-card--active", "mb-3")}
      testID={`asr-tier-${tier}`}
    >
      <View className="voice-card__header">
        <View className="h-9 w-9 items-center justify-center rounded-full bg-orange-100">
          <Download size={18} color={colors.warmAccent} />
        </View>
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="voice-card__title">{TIER_LABEL[tier]}</Text>
            {selected && (
              <View className="voice-badge">
                <Text className="voice-badge__text">Selected</Text>
              </View>
            )}
          </View>
          <Text className="voice-card__spec">
            {formatBytes(manifest.estimatedBytes)}
            {installed
              ? " — installed"
              : downloading
                ? ` — ${Math.round(progress * 100)}%`
                : ""}
          </Text>
        </View>
        <RadioDot checked={selected} />
      </View>
      <View className="voice-card__body">
        {downloading ? (
          <Text className="text-quiet" testID={`asr-downloading-${tier}`}>
            Downloading… {Math.round(progress * 100)}%
          </Text>
        ) : (
          <View className="flex-row items-center gap-2 self-start">
            {installed ? (
              <Pressable
                onPress={() => void deleteModel(tier)}
                className="btn btn--ghost active:opacity-80 flex-row items-center gap-2 px-4 py-2"
                accessibilityRole="button"
                accessibilityLabel={`Remove ${TIER_LABEL[tier]}`}
                testID={`asr-remove-${tier}`}
              >
                <Trash2 size={14} color={colors.secondaryText} />
                <Text className="text-body">Remove</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => void downloadModel(tier)}
                className={cn(
                  "btn btn--tonal active:opacity-80 flex-row items-center gap-2 px-4 py-2",
                  failed && "opacity-60",
                )}
                accessibilityRole="button"
                accessibilityLabel={failed ? "Retry" : "Download"}
                testID={`asr-download-${tier}`}
              >
                <Download size={14} color={colors.primary} />
                <Text className="font-sans-semibold text-body-md text-primary">
                  {failed ? "Retry" : "Download"}
                </Text>
              </Pressable>
            )}
          </View>
        )}
        {failed && error === ASR_INSUFFICIENT_STORAGE && (
          <Text
            className="mt-1 text-quiet"
            accessibilityLiveRegion="polite"
            testID={`asr-storage-note-${tier}`}
          >
            {insufficientStorageCopy(
              manifest.estimatedBytes * ASR_DISK_HEADROOM_FACTOR,
              freeDiskBytes,
            )}
          </Text>
        )}
        {failed && error !== null && error !== ASR_INSUFFICIENT_STORAGE && (
          <Text className="mt-1 text-quiet" testID={`asr-error-${tier}`}>
            {error}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

export function AsrSetup() {
  const load = useAsrStore((s) => s.load);
  const asrAvailable = useAsrStore((s) => s.asrAvailable);
  const deviceSupported = useAsrStore((s) => s.deviceSupported);
  const setUserASROverride = useAsrStore((s) => s.setUserASROverride);
  const { freeBytes, checked } = useFreeSpacePoll(true);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View className="mb-4">
      <SettingsSection description="Tap the mic in chat to dictate; speech is transcribed on your device.">
        <View className="row">
          <ToggleRow
            label="Voice input"
            description={
              deviceSupported
                ? undefined
                // PocketPal's unsupportedDeviceHelper, verbatim.
                : "This device is below the recommended spec. Voice input will likely be slow or may fail."
            }
            on={asrAvailable}
            onPress={() => setUserASROverride(!asrAvailable)}
          />
        </View>
      </SettingsSection>

      <View className="mb-3 mt-6 flex-row items-end justify-between">
        <View className="flex-1 pr-4">
          <Text className="section-title">Voice models</Text>
          <Text className="mt-1 text-quiet">
            On-device speech recognition. Uses storage space.
          </Text>
        </View>
        {checked && freeBytes !== null && (
          <Text className="text-quiet">{formatBytes(freeBytes, 1)} available</Text>
        )}
      </View>

      {ASR_TIER_ORDER.map((tier) => (
        <TierCard key={tier} tier={tier} />
      ))}
    </View>
  );
}
