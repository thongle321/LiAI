/** Per-model settings: identity, prompt, stop words, and a generation
 * sub-view for the sampler override.
 *
 * The generation view is a second view inside this sheet, not a second
 * sheet: stacking two native sheets on one another is fragile, and the
 * override is a sibling of these fields, not a separate destination.
 */

import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { BottomSheet } from "@expo/ui";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { ChevronLeft, X } from "lucide-react-native";

import { useModelStore } from "../../store/modelStore.ts";
import { useInference } from "../../store/inference.ts";
import { resolveSampler, type SamplerParams } from "../../lib/inference/sampler.ts";
import { SamplerRows } from "../SamplingSettings.tsx";
import { NavRow, SettingsSection } from "../SettingsRows.tsx";
import { colors, scrim } from "../../themes/tokens.ts";

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
  const { sampler: globalSampler, load } = useInference();
  const [view, setView] = useState<"main" | "generation">("main");
  const [displayName, setDisplayName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [stopWordsText, setStopWordsText] = useState("");
  const [draft, setDraft] = useState<Partial<SamplerParams>>({});

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (modelId) {
      const s = getModelSettings(modelId);
      setDisplayName(s.displayName);
      setSystemPrompt(s.systemPrompt);
      setStopWordsText(s.stopWords.join("\n"));
      setDraft(s.sampler ?? {});
      setView("main");
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

  function saveSampler(next: Partial<SamplerParams>): void {
    if (!modelId) return;
    setDraft(next);
    updateModelSettings(modelId, { sampler: next });
  }

  const overrideCount = Object.keys(draft).length;

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
      <KeyboardAwareScrollView
        className="flex-col"
        keyboardShouldPersistTaps="handled"
      >
        <View className="mb-4 flex-row items-center justify-between">
          {view === "generation" ? (
            <Pressable
              onPress={() => setView("main")}
              className="h-12 w-12 items-center justify-center"
              accessibilityRole="button"
              accessibilityLabel="Back to model settings"
            >
              <ChevronLeft size={20} color={colors.secondaryText} />
            </Pressable>
          ) : (
            <View className="h-12 w-12" />
          )}
          <Text className="font-sans-semibold text-h3 text-primary-text">
            {view === "generation" ? "Generation" : "Model Settings"}
          </Text>
          <Pressable
            onPress={onClose}
            className="h-12 w-12 items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel="Close model settings"
          >
            <X size={20} color={colors.secondaryText} />
          </Pressable>
        </View>

        {view === "generation" ? (
          <View className="flex-col gap-4">
            <Text className="font-sans text-body-md text-secondary-text">
              {overrideCount === 0
                ? "This model uses the global sampling settings."
                : `${overrideCount} value${overrideCount === 1 ? "" : "s"} overridden. Everything else follows the global settings.`}
            </Text>
            <SettingsSection>
              <SamplerRows
                sampler={resolveSampler(globalSampler, draft)}
                onChange={(patch) => saveSampler({ ...draft, ...patch })}
              />
            </SettingsSection>
            {overrideCount > 0 ? (
              <Pressable
                onPress={() => saveSampler({})}
                className="btn btn--secondary"
                accessibilityRole="button"
                accessibilityLabel="Reset generation settings to global"
              >
                <Text className="font-sans text-body-md text-primary">
                  Reset to global
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
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

            <SettingsSection>
              <View className="row">
                <NavRow
                  label="Generation"
                  description="Sampling overrides for this model alone."
                  value={overrideCount === 0 ? "Default" : "Custom"}
                  onPress={() => setView("generation")}
                />
              </View>
            </SettingsSection>

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
        )}
      </KeyboardAwareScrollView>
    </BottomSheet>
  );
}
