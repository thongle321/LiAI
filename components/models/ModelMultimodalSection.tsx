/** "Multimodal Settings" — the projection-model list inside Model Settings
 * (PocketPal parity: ProjectionModelSelector embedded in the sheet for
 * models that support vision).
 *
 * The candidates are the repo's sibling mmproj files recorded on the spec
 * at build time (`projectorCandidates`) — the list is exactly what the
 * downloader could fetch, and it never re-hits the Hub.
 *
 * A projector is not a row of its own here (unlike PocketPal): it stays an
 * inline record on the model, so "select" writes the record and starts the
 * projector leg of the existing two-leg download. Selection persists
 * IMMEDIATELY, like PocketPal's list — it is a live capability choice,
 * not part of the sheet's explicit-save transaction.
 *
 * The section TITLE is the sheet's, not this file's: the reference owns
 * both the divider and the heading, so ModelSettingsSheet renders them
 * around this component.
 */

import { Alert } from "react-native";
import { Pressable, Text, View } from "react-native";
import { CheckCircle2, Download, Trash2 } from "lucide-react-native";

import { useModelStore } from "../../store/modelStore";
import { useChatStore } from "../../store/chat";
import { colors } from "../../themes/tokens.ts";
import { formatBytes, progressCaption } from "./ModelBits.tsx";
import type { ModelFile, ModelSpec } from "../../types/models";

export function ModelMultimodalSection({ model }: { model: ModelSpec }) {
  const setProjector = useModelStore((s) => s.setProjector);
  const detachProjector = useModelStore((s) => s.detachProjector);
  const startProjectorDownload = useModelStore((s) => s.startProjectorDownload);
  const activeModelId = useModelStore((s) => s.activeModelId);
  // The engine holds ONE context, keyed by the projector it was loaded
  // with. Changing the pair under a loaded model means dropping it; the
  // next turn reloads through the same `ensure()` that resolves the path.
  const releaseEngine = useChatStore((s) => s.releaseEngine);

  const candidates: ModelFile[] = model.projectorCandidates ?? [];
  const selected = model.projector?.name;
  const isActive = activeModelId === model.id;
  // "completed" is the pair's proof of landing: the downloader marks the
  // row complete only after the projector leg too (pairDownloadStep).
  const pairComplete = model.downloadStatus === "completed";

  function applySelection(file: ModelFile): void {
    const run = (): void => {
      setProjector(model.id, file);
      if (isActive) void releaseEngine();
      void startProjectorDownload(model.id);
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
    if (!model.projector) return;
    void (async () => {
      const dependents = await detachProjector(model.id);
      if (isActive) void releaseEngine();
      if (dependents.length > 0) {
        Alert.alert(
          "Vision disabled",
          `This projector was shared, so vision is now off for its other models.\n\nDependent models: ${dependents.join(", ")}`,
        );
      }
    })();
  }

  return (
    <View className="gap-2">
      {/* The candidate header shows only when there is a choice to make
          (PocketPal parity: the section header hides for a single fit). */}
      {candidates.length > 1 ? (
        <Text className="font-sans text-body-sm text-secondary-text">
          Projection Models
        </Text>
      ) : null}
      {candidates.length === 0 ? (
        <Text className="py-2 text-center font-sans text-body-sm text-secondary-text">
          No compatible projection models found
        </Text>
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
          className="mt-2 min-h-12 flex-row items-center justify-center gap-2 rounded-lg border border-border px-4 py-2"
          accessibilityRole="button"
          accessibilityLabel="Remove projection model"
        >
          <Trash2 size={16} color={colors.error} />
          <Text className="font-sans text-body-sm text-error">
            Remove projection model
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}