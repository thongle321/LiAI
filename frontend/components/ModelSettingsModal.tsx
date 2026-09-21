/** Per-model settings editor: display name, system prompt, stop words.
 *
 * RN Modal reusing the Add-provider modal pattern. Settings persist in
 * modelStore (liai_model_settings_v1), keyed by model id.
 */

import { useEffect, useState } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";
import { X } from "lucide-react-native";

import { colors } from "../themes/tokens.ts";
import { useModelStore } from "../store/modelStore";

function parseStopWords(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0);
}

export function ModelSettingsModal({
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

  return (
    <Modal visible={modelId !== null} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-black/60 items-center justify-center p-4">
        <View className="bg-surface-1 border border-border rounded-2xl w-full p-6">
          <View className="flex-row items-center justify-between mb-4">
            <Text className="font-sans-semibold text-h4 text-primary-text">Model Settings</Text>
            <Pressable onPress={onClose}>
              <X size={24} color={colors.secondaryText} />
            </Pressable>
          </View>

          <View className="flex-col gap-4">
            <View>
              <Text className="font-sans text-body-sm text-secondary-text mb-1">Display name</Text>
              <TextInput
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Optional rename shown in lists"
                className="font-sans text-body-md text-primary-text bg-surface-2 border border-border rounded-lg px-4 py-3"
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
                className="font-sans text-body-md text-primary-text bg-surface-2 border border-border rounded-lg px-4 py-3"
                placeholderTextColor={colors.secondaryText}
              />
            </View>

            <View>
              <Text className="font-sans text-body-sm text-secondary-text mb-1">Stop words (one per line)</Text>
              <TextInput
                value={stopWordsText}
                onChangeText={setStopWordsText}
                placeholder={"<|eot_id|>\n<|end_of_text|>"}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                autoCapitalize="none"
                className="font-sans text-body-md text-primary-text bg-surface-2 border border-border rounded-lg px-4 py-3"
                placeholderTextColor={colors.secondaryText}
              />
            </View>

            <View className="flex-row gap-2 pt-2">
              <Pressable
                onPress={onClose}
                className="flex-1 py-3 px-4 bg-surface-2 border border-border rounded-lg items-center"
              >
                <Text className="font-sans text-body-md text-secondary-text">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSave}
                className="flex-1 py-3 px-4 bg-primary border border-primary/50 rounded-lg items-center"
              >
                <Text className="font-sans-semibold text-body-md text-base">Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
