/** "Available to download" group: preset cards with their quantization files. */

import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { ChevronDown, ChevronUp } from "lucide-react-native";

import { colors } from "../../themes/tokens.ts";
import { formatParams } from "../../lib/model-providers.ts";
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
  DownloadButton,
  DownloadProgressBar,
  ModelTypeIcon,
  StatusBadge,
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

  // Per-file states by exact spec id (one shared status smeared every row).
  const fileState = (file: PresetModelFile) => presetFileState(models, preset.id, file);
  const card = presetCardState(models, preset);
  const cardStatus = card.status;
  const showCardProgress = isProgressVisible(cardStatus);
  const params = preset.params ?? 0;

  return (
    <View className="mb-4 bg-surface-1 border border-border rounded-xl overflow-hidden">
      <Pressable onPress={() => setExpanded(!expanded)} className="p-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-1">
            <View className="flex-row items-center gap-2 mb-1">
              <ModelTypeIcon type={preset.type} />
              <Text className="font-sans-semibold text-h4 text-primary-text">{preset.name}</Text>
              {preset.recommended && (
                <View className="px-1.5 py-0.5 bg-primary/20 border border-primary/50 rounded">
                  <Text className="font-sans text-xs text-primary">Recommended</Text>
                </View>
              )}
            </View>
            <Text className="font-sans text-body-sm text-secondary-text/70">by {preset.author}</Text>
          </View>
          {expanded ? <ChevronUp size={20} color={colors.secondaryText} /> : <ChevronDown size={20} color={colors.secondaryText} />}
        </View>

        <View className="flex-row items-center justify-between mt-3">
          <StatusBadge status={cardStatus} />
          <View className="flex-row items-center gap-2">
            {params > 0 ? (
              <View className="px-1.5 py-0.5 bg-surface-2 border border-border rounded">
                <Text className="font-sans text-xs text-secondary-text">
                  {formatParams(params)}
                </Text>
              </View>
            ) : null}
            <View className="px-1.5 py-0.5 bg-surface-2 border border-border rounded">
              <Text className="font-sans text-xs text-secondary-text">
                {preset.files.length} file{preset.files.length === 1 ? "" : "s"}
              </Text>
            </View>
          </View>
        </View>

        {showCardProgress && (
          <DownloadProgressBar progress={card.progress} speed={card.speed} />
        )}
      </Pressable>

      {expanded && (
        <View className="border-t border-border px-4 pb-4">
          <Text className="font-sans text-body-sm text-secondary-text mt-3 mb-1">{preset.description}</Text>
          <View className="mb-3">
            <Text className="font-sans-semibold text-body-sm text-secondary-text mb-2">Available Quantizations</Text>
          </View>
          {preset.files.map((item) => {
            const st = fileState(item);
            return (
              <View key={item.name} className="py-3 border-b border-border/50">
                <View className="flex-row items-center justify-between">
                  <View className="flex-1">
                    <Text className="font-sans text-body-md text-primary-text">{item.name}</Text>
                    <View className="flex-row items-center gap-2 mt-1.5">
                      <View className="px-1.5 py-0.5 bg-surface-2 border border-border rounded">
                        <Text className="font-sans text-xs text-secondary-text">{item.quantization}</Text>
                      </View>
                      <Text className="font-sans text-body-sm text-secondary-text/70">{formatBytes(item.size)}</Text>
                    </View>
                  </View>
                  <DownloadButton
                    status={st.status}
                    progress={st.progress}
                    onPress={() => onDownload(preset.id, item)}
                    onPause={() => void pauseModelDownload(presetSpecId(preset.id, item.name))}
                    onResume={() => void resumeModelDownload(presetSpecId(preset.id, item.name))}
                    disabled={st.status === "completed"}
                  />
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
  onToggle: () => void;
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
