/** Vision download sheet (PocketPal VisionDownloadSheet parity).
 *
 * Shown before downloading a vision model: choose "with vision" (the pair,
 * default) or "text only", and pick WHICH projector from the repo's
 * siblings. Without this, the vision decision is made blind at download
 * and only revisable afterwards on the model card.
 *
 * The plain Download button bypasses this sheet — it takes the default
 * (with vision), exactly as PocketPal's does.
 */

import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { CheckCircle2 } from "lucide-react-native";

import { Sheet } from "../sheet.tsx";
import { ToggleRow } from "../settings-rows.tsx";
import { colors } from "../../themes/tokens.ts";
import { mmprojSiblings } from "../../services/models/vision-pairing.ts";
import type { HFModelFile, ModelFile } from "../../types/models";
import { formatBytes } from "./model-bits.tsx";

/** What the sheet hands back: whether the pair is fetched, and which
 *  projector when the user chose one (undefined = pairing rule decides). */
export interface VisionDownloadChoice {
  visionEnabled: boolean;
  projector?: ModelFile;
}

export function VisionDownloadSheet({
  visible,
  file,
  siblings,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  /** The LLM being downloaded (the sheet's title). */
  file: HFModelFile | null;
  /** Every gguf in the repo — the candidates come from here. */
  siblings: HFModelFile[];
  onClose: () => void;
  onConfirm: (file: HFModelFile, opts: VisionDownloadChoice) => void;
}) {
  const [visionEnabled, setVisionEnabled] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  const candidates: ModelFile[] = mmprojSiblings(siblings).map((f) => ({
    name: f.name,
    size: f.size,
    downloadUrl: f.downloadUrl,
  }));

  // A fresh open starts from the app's own default (pair automatically);
  // turning vision off clears the choice, as PocketPal does.
  useEffect(() => {
    if (!visible) return;
    setVisionEnabled(true);
    setSelected(null);
  }, [visible]);

  if (file === null) return null;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={file.name}
      testID="vision-download-sheet"
      actions={
        /* Pinned action row (PocketPal's Sheet.Actions) — see Sheet.tsx. */
        <View className="flex-row gap-2">
          <Pressable
            onPress={onClose}
            className="btn btn--secondary flex-1"
            accessibilityRole="button"
            accessibilityLabel="Cancel download"
          >
            <Text className="font-sans text-body-md text-primary">Cancel</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              const projector = candidates.find((c) => c.name === selected);
              onConfirm(file, {
                visionEnabled,
                ...(visionEnabled && projector !== undefined ? { projector } : {}),
              });
              onClose();
            }}
            className="btn btn--primary flex-1"
            accessibilityRole="button"
            accessibilityLabel={
              visionEnabled ? "Download with vision" : "Download text only"
            }
          >
            <Text className="font-sans-semibold text-body-md text-on-primary">
              {visionEnabled ? "Download with vision" : "Download text only"}
            </Text>
          </Pressable>
        </View>
      }
    >
      <View className="gap-2">
        <ToggleRow
          label="Enable vision"
          description="Process images as well as text"
          on={visionEnabled}
          onPress={() => {
            setVisionEnabled(!visionEnabled);
            if (visionEnabled) setSelected(null);
          }}
        />

        <Text className="font-sans text-body-sm text-secondary-text">
          Projection models
        </Text>
        {candidates.length === 0 ? (
          <Text className="font-sans text-body-md text-secondary-text">
            No projection models available
          </Text>
        ) : (
          // Selection only: the fetch belongs to the download that follows,
          // so no per-row download actions here (PocketPal's search-mode).
          candidates.map((c) => {
            const isSelected = c.name === selected;
            return (
              <Pressable
                key={c.name}
                onPress={() => setSelected(c.name)}
                className={`min-h-12 flex-row items-center justify-between gap-3 rounded-lg border px-4 py-2 ${
                  visionEnabled ? "border-border" : "border-transparent opacity-50"
                }`}
                accessibilityRole="radio"
                accessibilityLabel={`Use projector ${c.name}`}
                accessibilityState={{ selected: isSelected, disabled: !visionEnabled }}
              >
                <View className="flex-1">
                  <Text
                    numberOfLines={1}
                    className="font-sans text-body-md text-primary-text"
                  >
                    {c.name}
                  </Text>
                  <Text className="font-sans text-body-sm text-secondary-text">
                    {formatBytes(c.size)}
                  </Text>
                </View>
                <CheckCircle2
                  size={18}
                  color={isSelected ? colors.primary : colors.secondaryText}
                />
              </Pressable>
            );
          })
        )}
      </View>
    </Sheet>
  );
}