/** Catalog preset card: the preset plus its quantization files.
 *
 * PocketParity: the group this card used to live in ("Available to
 * download") is now computed by lib/models/model-groups.ts and rendered by
 * the screen, so this file is the card alone. The device-tier grouping it
 * once carried is gone with it — PocketPal groups by model type
 * (ModelsScreen.tsx:319-333), which the same module now does.
 */

import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { ChevronDown, ChevronUp } from "lucide-react-native";

import { colors } from "../../themes/tokens.ts";
import { useFreeSpacePoll } from "../../hooks/useStorageDisclosure.ts";
import { useModelStore } from "../../store/modelStore";
import { presetSpecId } from "../../lib/models/huggingface.ts";
import { storageDisclosure } from "../../lib/models/storage-disclosure.ts";
import { presetCardState, presetFileState } from "../../lib/models/file-state.ts";
import { findProjectorFile } from "../../lib/models/vision-pairing.ts";
import type { PresetModel, PresetModelFile } from "../../types/models";
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
  // One poll for the card, shared by its quantization rows: a card with
  // five files must not ask the filesystem the same question five times.
  // Only while it is expanded — a collapsed card shows no rows to inform.
  const { freeBytes, checked } = useFreeSpacePoll(expanded);

  return (
    <View className="mb-4 bg-surface-1 border border-border rounded-lg overflow-hidden">
      <Pressable
        onPress={() => setExpanded(!expanded)}
        className="p-5"
        accessibilityRole="button"
        accessibilityLabel={preset.name}
        accessibilityState={{ expanded }}
      >
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
          {/* No action row: a collapsed card's only affordance is expanding
              to reach the per-quantization Download buttons, and a download
              started there gets its progress and Cancel below. */}
        </View>

        {/* Outside the header Pressable on purpose: the Cancel button is
            full-width now, and nested inside it a tap would also toggle the
            card — cancelling a download and expanding it at once. */}
        {(showCardProgress || downloadingSpecId) && (
          <View className="px-5 pb-4">
            {showCardProgress ? (
              <DownloadProgressBar
                progress={card.progress}
                downloaded={card.downloaded}
                total={card.total}
                speed={card.speed}
              />
            ) : null}
            {downloadingSpecId ? (
              <CancelDownloadButton
                onPress={() => void cancelModelDownload(downloadingSpecId)}
              />
            ) : null}
          </View>
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
            const fit = storageDisclosure({
              modelBytes: item.size,
              // The projector leg runs after this one, so a vision preset's
              // requirement is the pair. Same helper the downloader uses, so
              // the promise on this card and the fetch can never drift.
              projectorBytes: findProjectorFile(item, preset.files)?.size,
              freeBytes,
              checked,
            });
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
                    <DownloadButton
                      status={st.status}
                      progress={st.progress}
                      onPress={() => onDownload(preset.id, item)}
                      onPause={() => void pauseModelDownload(presetSpecId(preset.id, item.name))}
                      onResume={() => void resumeModelDownload(presetSpecId(preset.id, item.name))}
                      disabled={!fit.fits || st.status === "completed"}
                    />
                  </View>
                </View>
                {/* The shortfall is stated here, on the card, rather than
                    left for the user to discover from a disabled button. */}
                {st.status !== "completed" && fit.message ? (
                  <Text className="storage-warning mt-2">
                    {fit.message}
                  </Text>
                ) : null}
                {isProgressVisible(st.status) && (
                  <>
                    <DownloadProgressBar
                      progress={st.progress}
                      downloaded={st.downloaded}
                      total={st.total}
                      speed={st.speed}
                    />
                    <CancelDownloadButton
                      onPress={() =>
                        void cancelModelDownload(presetSpecId(preset.id, item.name))
                      }
                    />
                  </>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
