/** Projection-model selector: which mmproj this vision model uses.
 *
 * The candidates are the repo's sibling mmproj files, recorded on the spec
 * at build time (`projectorCandidates`) — the sheet never re-hits the Hub,
 * and the list it shows is exactly what the downloader could fetch.
 *
 * Unlike PocketPal, a projector is NOT a row of its own here: it stays an
 * inline `ModelFile` on the model, and the download rides the existing
 * two-leg job (`startSpecDownload` → `pairDownloadStep`). So "select" is a
 * record write plus that fetch — there is no separate projector to delete,
 * only to detach.
 */

import { Alert } from "react-native";
import { Pressable, ScrollView, Text, View } from "react-native";
import { CheckCircle2, Download, Trash2 } from "lucide-react-native";

import { useModelStore } from "../../store/modelStore";
import { useChatStore } from "../../store/chat";
import { Sheet } from "../Sheet.tsx";
import { colors } from "../../themes/tokens.ts";
import { formatBytes, progressCaption } from "./ModelBits.tsx";
import type { ModelFile, ModelSpec } from "../../types/models";

export function ProjectorSelectorSheet({
  model,
  visible,
  onClose,
}: {
  model: ModelSpec | null;
  visible: boolean;
  onClose: () => void;
}) {
  const setProjector = useModelStore((s) => s.setProjector);
  const detachProjector = useModelStore((s) => s.detachProjector);
  const startProjectorDownload = useModelStore((s) => s.startProjectorDownload);
  const activeModelId = useModelStore((s) => s.activeModelId);
  // The engine holds ONE context, keyed by the projector it was loaded
  // with. Changing the pair under a loaded model means dropping it; the
  // next turn reloads through the same `ensure()` that resolves the path.
  const releaseEngine = useChatStore((s) => s.releaseEngine);

  if (model === null) return null;
  const candidates: ModelFile[] = model.projectorCandidates ?? [];
  const selected = model.projector?.name;
  const isActive = activeModelId === model.id;
  // "completed" is the pair's proof of landing: the downloader marks the
  // row complete only after the projector leg too (pairDownloadStep).
  const pairComplete = model.downloadStatus === "completed";

  function applySelection(file: ModelFile): void {
    const run = (): void => {
      setProjector(model!.id, file);
      onClose();
      if (isActive) void releaseEngine();
      void startProjectorDownload(model!.id);
    };
    if (!isActive) {
      run();
      return;
    }
    Alert.alert(
      "Reload model",
      "The model needs to reload to use a different projection model. Reload it now?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Reload", onPress: run },
      ],
    );
  }

  function confirmDetach(): void {
    if (!model?.projector) return;
    void (async () => {
      const dependents = await detachProjector(model.id);
      onClose();
      if (isActive) void releaseEngine();
      if (dependents.length > 0) {
        Alert.alert(
          "Vision disabled",
          `This projector was shared. Vision is now off for: ${dependents.join(", ")}.`,
        );
      }
    })();
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Projection models"
      testID="projector-selector-sheet"
    >
      <ScrollView className="max-h-[70%]">
        {candidates.length === 0 ? (
          <View className="py-6 items-center">
            <Text className="font-sans text-body-md text-secondary-text text-center">
              No compatible projection models found
            </Text>
          </View>
        ) : (
          candidates.map((file) => {
            const isSelected = file.name === selected;
            const inFlight =
              isSelected &&
              (model.downloadStatus === "downloading" ||
                model.downloadStatus === "paused");
            const downloaded = isSelected && pairComplete;
            return (
              <Pressable
                key={file.name}
                onPress={() => applySelection(file)}
                className="min-h-12 flex-row items-center justify-between gap-3 border-b border-border py-3"
                accessibilityRole="button"
                accessibilityLabel={`Use projector ${file.name}`}
                accessibilityState={{ selected: isSelected }}
              >
                <View className="flex-1">
                  <Text
                    numberOfLines={2}
                    className="font-sans text-body-md text-primary-text"
                  >
                    {file.name}
                  </Text>
                  <Text className="font-sans text-body-sm text-secondary-text">
                    {inFlight
                      ? progressCaption(
                          model.downloadedBytes,
                          model.totalBytes,
                          model.speedBytesPerSec ?? 0,
                        )
                      : downloaded
                        ? "Downloaded"
                        : formatBytes(file.size)}
                  </Text>
                </View>
                {inFlight ? (
                  <Download size={18} color={colors.secondaryText} />
                ) : downloaded ? (
                  <CheckCircle2 size={18} color={colors.primary} />
                ) : (
                  <Download size={18} color={colors.primary} />
                )}
              </Pressable>
            );
          })
        )}

        {model.projector ? (
          <Pressable
            onPress={confirmDetach}
            className="mt-4 min-h-12 flex-row items-center justify-center gap-2 rounded-lg border border-border px-4 py-2"
            accessibilityRole="button"
            accessibilityLabel="Remove projection model"
          >
            <Trash2 size={16} color={colors.error} />
            <Text className="font-sans text-body-sm text-error">
              Remove projection model
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </Sheet>
  );
}