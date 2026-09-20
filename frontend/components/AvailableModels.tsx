/** "Available to download" group: preset compact models for mobile. */

import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { ChevronDown, ChevronUp } from "lucide-react-native";

import { colors } from "../themes/tokens.ts";
import { useModelStore } from "../store/modelStore";
import type { PresetModel, PresetModelFile } from "../types/models";
import {
  DownloadButton,
  DownloadProgressBar,
  ModelGroup,
  StatusBadge,
  formatBytes,
  isProgressVisible,
} from "./ModelBits.tsx";

function PresetModelCard({
  preset,
  onDownload,
}: {
  preset: PresetModel;
  onDownload: (modelId: string, file: PresetModelFile) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { models } = useModelStore();

  const existingModel = models.find(
    (m) => m.origin === "preset" && m.id.startsWith(`preset-${preset.id}-`),
  );

  const getStatus = (_file: PresetModelFile) => {
    if (!existingModel) return "idle";
    return existingModel.downloadStatus;
  };

  const getProgress = (_file: PresetModelFile) => {
    if (!existingModel) return 0;
    return existingModel.downloadProgress;
  };

  const cardStatus = existingModel ? existingModel.downloadStatus : "idle";
  const showCardProgress =
    existingModel !== undefined && isProgressVisible(cardStatus);

  return (
    <View className="mb-4 bg-surface-1 border border-border rounded-xl overflow-hidden">
      <Pressable onPress={() => setExpanded(!expanded)} className="p-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-1">
            <View className="flex-row items-center gap-2 mb-1">
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
          <View className="px-1.5 py-0.5 bg-surface-2 border border-border rounded">
            <Text className="font-sans text-xs text-secondary-text">
              {preset.files.length} file{preset.files.length === 1 ? "" : "s"}
            </Text>
          </View>
        </View>

        {showCardProgress && (
          <DownloadProgressBar
            progress={existingModel.downloadProgress}
            downloaded={existingModel.downloadedBytes}
            total={existingModel.totalBytes}
          />
        )}
      </Pressable>

      {expanded && (
        <View className="border-t border-border px-4 pb-4">
          <Text className="font-sans text-body-sm text-secondary-text mt-3 mb-1">{preset.description}</Text>
          <View className="mb-3">
            <Text className="font-sans-semibold text-body-sm text-secondary-text mb-2">Available Quantizations</Text>
          </View>
          {preset.files.map((item) => {
            const st = getStatus(item);
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
                  modelId={preset.id}
                  file={item}
                  status={st}
                  progress={getProgress(item)}
                  onPress={() => onDownload(preset.id, item)}
                  disabled={st === "downloading"}
                />
              </View>
              {isProgressVisible(st) && existingModel && (
                <DownloadProgressBar
                  progress={existingModel.downloadProgress}
                  downloaded={existingModel.downloadedBytes}
                  total={existingModel.totalBytes}
                />
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
}: {
  open: boolean;
  onToggle: () => void;
  onDownload: (modelId: string, file: PresetModelFile) => void;
}) {
  const { presets } = useModelStore();
  return (
    <ModelGroup
      title="Available to download"
      count={presets.length}
      open={open}
      onToggle={onToggle}
    >
      {presets.map((item) => (
        <PresetModelCard key={item.id} preset={item} onDownload={onDownload} />
      ))}
    </ModelGroup>
  );
}
