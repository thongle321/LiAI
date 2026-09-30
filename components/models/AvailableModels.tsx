/** "Available to download" group: preset cards with their quantization files. */

import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { ChevronDown, ChevronUp } from "lucide-react-native";

import { colors } from "../../themes/tokens.ts";
import { parseTiers } from "../../lib/models/device-tiers.ts";
import tiersJson from "../../assets/device-tiers.json";

// Parsed once (see onboarding/model.tsx): static bundle data.
const TIERS = parseTiers(tiersJson);
import { useLoadGuard } from "../../hooks/useLoadGuard.ts";
import { useModelStore } from "../../store/modelStore";
import { presetSpecId } from "../../lib/models/huggingface.ts";
import { isPresetDownloaded, presetCardState, presetFileState } from "../../lib/models/file-state.ts";
import type { PresetModel, PresetModelFile } from "../../types/models";
import { ModelAccordion } from "./ModelAccordion.tsx";
import {
  CancelDownloadButton,
  DownloadButton,
  DownloadProgressBar,
  ModelTypeIcon,
  formatBytes,
  isProgressVisible,
} from "./ModelBits.tsx";

export function PresetModelCard({
  preset,
  onDownload,
}: {
  preset: PresetModel;
  onDownload: (modelId: string, file: PresetModelFile) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const models = useModelStore((s) => s.models);
  const pauseModelDownload = useModelStore((s) => s.pauseModelDownload);
  const resumeModelDownload = useModelStore((s) => s.resumeModelDownload);
  const cancelModelDownload = useModelStore((s) => s.cancelModelDownload);

  // Per-file states by exact spec id (one shared status smeared every row).
  const fileState = (file: PresetModelFile) => presetFileState(models, preset.id, file);
  const card = presetCardState(models, preset);
  const cardStatus = card.status;
  // The card bar is the collapsed-state affordance. Once expanded, the
  // per-quantization rows carry per-file progress, so keeping both showed
  // the same download twice.
  const showCardProgress = isProgressVisible(cardStatus) && !expanded;
  // Hoisted so the closure keeps the narrowing (and needs no cast): cancel
  // takes the downloading file's spec id, not the preset id.
  const downloadingSpecId = showCardProgress ? card.specId : undefined;

  return (
    <View className="mb-4 bg-surface-1 border border-border rounded-lg overflow-hidden">
      <Pressable onPress={() => setExpanded(!expanded)} className="p-5">
        <View className="flex-row items-center justify-between">
          <View className="flex-1">
            <View className="flex-row items-center gap-2 mb-1">
              <ModelTypeIcon type={preset.type} />
              <Text className="font-sans-semibold text-h4 text-primary-text">{preset.name}</Text>
              {preset.recommended && (
                <View className="rounded bg-surface-3 px-2 py-0.5">
                  <Text className="font-sans text-caption text-primary-text">Recommended</Text>
                </View>
              )}
            </View>
            <Text className="font-sans text-body-sm text-secondary-text">by {preset.author}</Text>
          </View>
          {expanded ? <ChevronUp size={20} color={colors.secondaryText} /> : <ChevronDown size={20} color={colors.secondaryText} />}
        </View>

        {/* No status row here: the section it lives in already means "not
            downloaded", so a "Not downloaded" label is noise. The Download
            button below carries the state. */}
        <View className="mt-3 flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            {/* One size, named: the parameter count (0.6B) and the file size
                (751 MB) are different facts, and showing both unlabelled
                read as two competing sizes for one model. */}
            <View className="rounded bg-surface-2 px-2 py-0.5">
              <Text className="font-sans text-caption text-secondary-text">
                {formatBytes(preset.files.reduce((sum, f) => sum + f.size, 0))}
              </Text>
            </View>
            <View className="rounded bg-surface-2 px-2 py-0.5">
              <Text className="font-sans text-caption text-secondary-text">
                {preset.files.length} file{preset.files.length === 1 ? "" : "s"}
              </Text>
            </View>
          </View>
          {/* Collapsed cards carry no action row, so a download started here
              had no way out. */}
          {downloadingSpecId && (
            <CancelDownloadButton
              onPress={() => void cancelModelDownload(downloadingSpecId)}
            />
          )}
        </View>

        {showCardProgress && (
          <DownloadProgressBar progress={card.progress} speed={card.speed} />
        )}
      </Pressable>

      {expanded && (
        <View className="border-t border-border px-5 pb-4">
          <Text className="font-sans text-body-sm text-secondary-text mt-3 mb-1">{preset.description}</Text>
          <View className="mb-3">
            <Text className="font-sans-semibold text-body-sm text-secondary-text mb-2">Available Quantizations</Text>
          </View>
          {preset.files.map((item) => {
            const st = fileState(item);
            return (
              <View key={item.name} className="py-3 border-b border-border">
                <View className="flex-row items-center justify-between">
                  <View className="flex-1">
                    <Text className="font-sans text-body-md text-primary-text">{item.name}</Text>
                    <View className="flex-row items-center gap-2 mt-2">
                  <View className="rounded bg-surface-2 px-2 py-0.5">
                        <Text className="font-sans text-caption text-secondary-text">{item.quantization}</Text>
                      </View>
                      <Text className="font-sans text-body-sm text-secondary-text">{formatBytes(item.size)}</Text>
                    </View>
                  </View>
                  <View className="flex-row items-center gap-2">
                    {isProgressVisible(st.status) && (
                      <CancelDownloadButton
                        onPress={() =>
                          void cancelModelDownload(presetSpecId(preset.id, item.name))
                        }
                      />
                    )}
                    <DownloadButton
                      status={st.status}
                      progress={st.progress}
                      onPress={() => onDownload(preset.id, item)}
                      onPause={() => void pauseModelDownload(presetSpecId(preset.id, item.name))}
                      onResume={() => void resumeModelDownload(presetSpecId(preset.id, item.name))}
                      disabled={st.status === "completed"}
                    />
                  </View>
                </View>
                {isProgressVisible(st.status) && (
                  <DownloadProgressBar progress={st.progress} speed={st.speed} />
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

export function AvailableModels({
  open,
  onToggle,
  onDownload,
  grouped = true,
}: {
  open: boolean;
  /** Receives the Collapsible's next state, not a bare toggle. */
  onToggle: (next: boolean) => void;
  onDownload: (modelId: string, file: PresetModelFile) => void;
  /** PocketPal `grouped` filter: tier headers on, or one flat preset list. */
  grouped?: boolean;
}) {
  const presets = useModelStore((s) => s.presets);
  const models = useModelStore((s) => s.models);
  // Finished presets live in Ready: hide them here (PocketPal parity).
  const visible = presets.filter((p) => !isPresetDownloaded(models, p));
  const guard = useLoadGuard();
  const tiers = TIERS;

  function onGuardedDownload(modelId: string, file: PresetModelFile): void {
    guard(file.size, () => onDownload(modelId, file));
  }

  const cards = (items: PresetModel[]) =>
    items.map((item) => (
      <PresetModelCard key={item.id} preset={item} onDownload={onGuardedDownload} />
    ));

  return (
    <ModelAccordion
      title="Available to download"
      count={visible.length}
      open={open}
      onToggle={onToggle}
      // Explicit: this section never holds the active model, so it never
      // highlights (the Ready section answers that question alone).
      active={false}
    >
      {grouped ? (
        tiers.map((tier) => {
          const tierPresets = visible.filter((p) => tier.presetIds.includes(p.id));
          if (tierPresets.length === 0) return null;
          return (
            <View key={tier.id}>
              <Text className="mb-1 mt-3 font-sans-semibold text-body-sm text-secondary-text">
                {tier.label} — {tier.blurb}
              </Text>
              {cards(tierPresets)}
            </View>
          );
        })
      ) : (
        <View className="mt-3">{cards(visible)}</View>
      )}
    </ModelAccordion>
  );
}
