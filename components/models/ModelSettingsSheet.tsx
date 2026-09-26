/** Per-model settings editor: display name, system prompt, stop words.
 *
 * Persists in modelStore (liai_model_settings_v1), keyed by model id.
 */

import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { BottomSheet } from "@expo/ui";
import { X } from "lucide-react-native";

import { colors, scrim } from "../../themes/tokens.ts";
import { useModelStore } from "../../store/modelStore";

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
  const { getModelSettings, updateModelSettings } = useModelStore();
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

  // Native sheet (SwiftUI / Compose), themed to the app by the root Host:
  // Clean White container, the Scrim backdrop, seed Signal Blue.
  return (
    <BottomSheet
      isPresented={modelId !== null}
      onDismiss={onClose}
      containerColor={colors.surface1}
      scrimColor={scrim}
      contentPadding={20}
      testID="model-settings-sheet"
    >
      <ScrollView className="flex-col">
        <View className="mb-4 flex-row items-center justify-between">
          <Text className="font-sans-semibold text-h3 text-primary-text">Model Settings</Text>
          <Pressable
            onPress={onClose}
            className="h-11 w-11 items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel="Close model settings"
          >
            <X size={20} color={colors.secondaryText} />
          </Pressable>
        </View>

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
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                className="font-sans text-body-md text-primary-text bg-surface-2 border border-border rounded-lg px-5 py-3"
                placeholderTextColor={colors.secondaryText}
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
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                autoCapitalize="none"
                className="font-sans text-body-md text-primary-text bg-surface-2 border border-border rounded-lg px-5 py-3"
                placeholderTextColor={colors.secondaryText}
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
        </ScrollView>
    </BottomSheet>
  );
}
