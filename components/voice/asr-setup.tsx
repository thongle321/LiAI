/** Voice-input (ASR) setup: the mic's availability + the tier downloads,
 *  riding the Voice settings screen under TTS (D7 — PocketPal's ASR
 *  settings surface). Availability is a plain ON/OFF toggle over the
 *  persisted tri-state: OFF and ON are explicit overrides; toggling is
 *  how the user says they want a side of the device default.
 *
 *  The tiers are PocketPal's flat rows: label + size on the left, the
 *  download action on the right, no cards or radio column. Installing a
 *  tier selects it (store/downloadModel), and tapping an installed row
 *  switches to it via the store's public `selectTier` — the ready-gated
 *  switch (#1017). Names and hints are the shared copy in
 *  utils/asr-tier-label.ts, the same strings the setup sheets show.
 *  Rows stay hidden while Voice input is off. */

import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import { Check } from "lucide-react-native";

import { useColors } from "@/themes/tokens.ts";
import { formatBytes } from "@/services/models/progress.ts";
import { useFreeSpacePoll } from "@/hooks/useStorageDisclosure.ts";
import { SettingsSection, ToggleRow } from "@/components/settings-rows.tsx";
import { useAsrStore } from "@/store/asr.ts";
import {
  ASR_DISK_HEADROOM_FACTOR,
  ASR_INSUFFICIENT_STORAGE,
  ASR_TIER_ORDER,
  ASR_TIERS,
} from "@/services/asr/constants.ts";
import { insufficientStorageCopy } from "@/services/asr/error-copy.ts";
import { ASR_TIER_LABEL, ASR_TIER_HINT } from "@/utils/asr-tier-label.ts";
import type { AsrTier } from "@/services/asr/types.ts";

function TierRow({ tier, last }: { tier: AsrTier; last: boolean }) {
  const colors = useColors();
  const manifest = ASR_TIERS[tier];
  const selected = useAsrStore((s) => s.selectedTier === tier);
  const state = useAsrStore((s) => s.downloadStates[tier]);
  const progress = useAsrStore((s) => s.downloadProgress[tier]);
  const error = useAsrStore((s) => s.downloadError[tier]);
  const selectTier = useAsrStore((s) => s.selectTier);
  const deleteModel = useAsrStore((s) => s.deleteModel);
  const downloadModel = useAsrStore((s) => s.downloadModel);
  const freeDiskBytes = useAsrStore((s) => s.freeDiskBytes);
  const installed = state === "ready";
  const downloading = state === "downloading";
  const failed = state === "error";

  return (
    <View className={last ? "row row--titled row--last" : "row row--titled"}>
      <View className="flex-row items-center gap-3">
        <Pressable
          onPress={installed ? () => selectTier(tier) : undefined}
          disabled={!installed}
          accessibilityRole="radio"
          accessibilityState={{ checked: installed && selected, disabled: !installed }}
          accessibilityLabel={ASR_TIER_LABEL[tier]}
          className="flex-1 flex-row items-center"
          testID={`asr-tier-${tier}`}
        >
          <View className="flex-1 pr-3">
            <Text className="font-sans text-body-md text-primary-text">
              {ASR_TIER_LABEL[tier]}
            </Text>
            <Text className="mt-1 font-sans text-xs text-secondary-text">
              {ASR_TIER_HINT[tier]} · {formatBytes(manifest.estimatedBytes, 0)}
              {downloading ? ` — ${Math.round(progress * 100)}%` : ""}
            </Text>
            {failed && error === ASR_INSUFFICIENT_STORAGE && (
              <Text
                className="mt-1 font-sans text-body-sm text-error"
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
              <Text
                className="mt-1 font-sans text-body-sm text-error"
                accessibilityLiveRegion="polite"
                testID={`asr-error-${tier}`}
              >
                {error}
              </Text>
            )}
          </View>
          {installed && selected ? <Check size={16} color={colors.primary} /> : null}
        </Pressable>

        {downloading ? (
          <Pressable
            disabled
            accessibilityRole="button"
            accessibilityState={{ disabled: true }}
            className="btn btn--secondary btn--disabled"
            accessibilityLabel="Downloading"
            testID={`asr-downloading-${tier}`}
          >
            <Text className="text-body">Downloading…</Text>
          </Pressable>
        ) : installed ? (
          <Pressable
            onPress={() => void deleteModel(tier)}
            className="btn btn--secondary active:opacity-80"
            accessibilityRole="button"
            accessibilityLabel={`Remove ${ASR_TIER_LABEL[tier]}`}
            testID={`asr-remove-${tier}`}
          >
            <Text className="text-body">Remove</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => void downloadModel(tier)}
            className="btn btn--tonal active:opacity-80"
            accessibilityRole="button"
            accessibilityLabel={failed ? "Retry" : "Download"}
            testID={`asr-download-${tier}`}
          >
            <Text className="text-body">{failed ? "Retry" : "Download"}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export function AsrSetup() {
  const load = useAsrStore((s) => s.load);
  const asrAvailable = useAsrStore((s) => s.asrAvailable);
  const voiceModeAvailable = useAsrStore((s) => s.voiceModeAvailable);
  const deviceSupported = useAsrStore((s) => s.deviceSupported);
  const setUserASROverride = useAsrStore((s) => s.setUserASROverride);
  const setUserVoiceModeOverride = useAsrStore((s) => s.setUserVoiceModeOverride);
  const { freeBytes, checked } = useFreeSpacePoll(asrAvailable);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View className="mb-4">
      <SettingsSection title="Hands-free voice">
        <View className="row row--titled row--last">
          <ToggleRow
            label="Hands-free voice"
            description={
              deviceSupported
                ? undefined
                : "This device is below the recommended spec. Hands-free voice will likely be slow or may fail."
            }
            on={voiceModeAvailable}
            onPress={() => setUserVoiceModeOverride(!voiceModeAvailable)}
          />
        </View>
      </SettingsSection>
      <SettingsSection title="Voice Input">
        <View
          className={
            asrAvailable ? "row row--titled" : "row row--titled row--last"
          }
        >
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

        {asrAvailable &&
          ASR_TIER_ORDER.map((tier, index) => (
            <TierRow
              key={tier}
              tier={tier}
              last={index === ASR_TIER_ORDER.length - 1}
            />
          ))}

        {asrAvailable && checked && freeBytes !== null && (
          <Text className="mt-2 self-end font-sans text-xs text-secondary-text">
            {formatBytes(freeBytes, 1)} available
          </Text>
        )}
      </SettingsSection>
    </View>
  );
}
