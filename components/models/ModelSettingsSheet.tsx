/** Per-model settings: identity, prompt, stop words.
 *
 * No generation settings here, deliberately: sampling is per conversation
 * (PocketPal's own split — a model sheet holds name, chat template and stop
 * words, and never the sampler), reached from the chat screen's
 * "Generation settings" menu.
 */

import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { useModelStore } from "../../store/modelStore";
import { Sheet } from "../Sheet.tsx";
import { colors } from "../../themes/tokens.ts";

function parseStopWords(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0);
}

export function ModelSettingsSheet({
  modelId,
  onClose,
}: {
  modelId: string | null;
  onClose: () => void;
}) {
  // Stable selectors: both are stable store functions, so this sheet
  // never re-renders on model-store writes.
  const getModelSettings = useModelStore((s) => s.getModelSettings);
  const updateModelSettings = useModelStore((s) => s.updateModelSettings);
  const [displayName, setDisplayName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [stopWordsText, setStopWordsText] = useState("");

  useEffect(() => {
    if (modelId) {
      const s = getModelSettings(modelId);
      setDisplayName(s.displayName);
      setSystemPrompt(s.systemPrompt);
      setStopWordsText(s.stopWords.join("\n"));
    }
  }, [modelId]);

  function handleSave(): void {
    if (!modelId) return;
    updateModelSettings(modelId, {
      displayName: displayName.trim(),
      systemPrompt,
      stopWords: parseStopWords(stopWordsText),
    });
    onClose();
  }

  // Short sheet on the shared Sheet: TrueSheet's auto detent sizes to
  // the content, and keyboard avoidance comes from the wrapper.
  return (
    <Sheet
      visible={modelId !== null}
      onClose={onClose}
      title="Model Settings"
      testID="model-settings-sheet"
    >
      <View className="flex-col gap-4">
          <View>
            <Text className="font-sans text-body-sm text-secondary-text mb-1">Display name</Text>
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Optional rename shown in lists"
              className="font-sans text-body-md text-primary-text bg-surface-2 border border-border rounded-lg px-5 py-3"
              placeholderTextColor={colors.secondaryText}
            />
          </View>

          <View>
            <Text className="font-sans text-body-sm text-secondary-text mb-1">System prompt</Text>
            <TextInput
              value={systemPrompt}
              onChangeText={setSystemPrompt}
              placeholder="Personality and instructions for this model"
              className="font-sans text-body-md text-primary-text bg-surface-2 border border-border rounded-lg px-5 py-3"
              placeholderTextColor={colors.secondaryText}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          <View>
            <Text className="font-sans text-body-sm text-secondary-text mb-1">
              Stop words (one per line)
            </Text>
            <TextInput
              value={stopWordsText}
              onChangeText={setStopWordsText}
              placeholder={"<|eot_id|>\n<|end_of_text|>"}
              className="font-sans text-body-md text-primary-text bg-surface-2 border border-border rounded-lg px-5 py-3"
              placeholderTextColor={colors.secondaryText}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              autoCapitalize="none"
            />
          </View>

          <View className="flex-row gap-2 pt-2">
            <Pressable
              onPress={onClose}
              className="btn btn--secondary flex-1"
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text className="font-sans text-body-md text-primary">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              className="btn btn--primary flex-1"
              accessibilityRole="button"
              accessibilityLabel="Save model settings"
            >
              <Text className="font-sans-semibold text-body-md text-on-primary">Save</Text>
            </Pressable>
          </View>
        </View>
    </Sheet>
  );
}
