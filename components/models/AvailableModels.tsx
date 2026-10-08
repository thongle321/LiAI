/** "Available to download" group: preset cards with their quantization files. */

import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { getFreeDiskStorageAsync } from "expo-file-system/legacy";
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
import { ModelCard } from "./ModelCard.tsx";
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
              <Text className="font-sans-semibold text-body-md text-primary-text">{preset.name}</Text>
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
          <DownloadProgressBar
            progress={card.progress}
            downloaded={card.downloaded}
            total={card.total}
            speed={card.speed}
          />
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
                  <DownloadProgressBar
              progress={st.progress}
              downloaded={st.downloaded}
              total={st.total}
              speed={st.speed}
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
  onOpenSettings,
  grouped = true,
}: {
  open: boolean;
  /** Receives the Collapsible's next state, not a bare toggle. */
  onToggle: (next: boolean) => void;
  onDownload: (modelId: string, file: PresetModelFile) => void;
  onOpenSettings: (modelId: string) => void;
  /** PocketPal `grouped` filter: tier headers on, or one flat preset list. */
  grouped?: boolean;
}) {
  const presets = useModelStore((s) => s.presets);
  const models = useModelStore((s) => s.models);
  const startSpecDownload = useModelStore((s) => s.startSpecDownload);
  const activeHfToken = useModelStore((s) => s.activeHfToken);
  // Finished presets live in Ready: hide them here (PocketPal parity).
  const visible = presets.filter((p) => !isPresetDownloaded(models, p));
  // PocketPal splits its groups on isDownloaded alone, so an HF bookmark
  // sits in this section beside the presets, not in Ready.
  const bookmarks = models.filter(
    (m) => m.origin === "huggingface" && m.downloadStatus !== "completed",
  );
  const guard = useLoadGuard();
  const tiers = TIERS;
  const [freeBytes, setFreeBytes] = useState<number | null>(null);

  // Read once for the whole section, not per card: a dozen cards asking
  // the filesystem the same question is a dozen round trips.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void getFreeDiskStorageAsync()
      .then((free) => {
        if (!cancelled) setFreeBytes(free);
      })
      .catch(() => {
        // Unknown free space must never disable a download button.
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

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
      count={visible.length + bookmarks.length}
      open={open}
      onToggle={onToggle}
    >
      {bookmarks.length > 0 ? (
        <View className="mb-4">
          {bookmarks.map((bookmark) => (
            <ModelCard
              key={bookmark.id}
              item={bookmark}
              isActive={false}
              onDownload={() => {
                const file = bookmark.files[0];
                if (!file) return;
                guard(file.size, () =>
                  // A gated repo's file needs the token attached, exactly
                  // as the search sheet does it; without it the download
                  // 401s halfway.
                  void startSpecDownload(bookmark, file, activeHfToken() ?? undefined),
                );
              }}
              outOfSpace={
                freeBytes !== null &&
                bookmark.files.reduce((sum, f) => sum + f.size, 0) > freeBytes
              }
              /* The pending branch renders Download instead of Load/Unload,
                 so neither callback is reachable from a bookmark. */
              onActivate={() => {}}
              onDeactivate={() => {}}
              onSettings={() => onOpenSettings(bookmark.id)}
            />
          ))}
        </View>
      ) : null}
      {grouped ? (
        // Only tier-listed presets render here — the coverage invariant is
        // a test-time decision (C9, option c): a catalog preset missing
        // from every tier fails tests/preset-catalog.test.ts rather than
        // silently vanishing at runtime.
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
