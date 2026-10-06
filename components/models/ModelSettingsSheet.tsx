/** Per-model settings: identity, prompt, stop words, tokens, template.
 *
 * No generation settings here, deliberately: sampling is per conversation
 * (PocketPal's own split — a model sheet holds name, chat template and stop
 * words, and never the sampler), reached from the chat screen's
 * "Generation settings" menu.
 */

import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { X } from "lucide-react-native";

import { useModelStore } from "../../store/modelStore";
import { Sheet } from "../Sheet.tsx";
import { ToggleRow } from "../SettingsRows.tsx";
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
  const [stopWords, setStopWords] = useState<string[]>([]);
  const [stopWordDraft, setStopWordDraft] = useState("");
  const [addBosToken, setAddBosToken] = useState(false);
  const [addEosToken, setAddEosToken] = useState(false);
  const [bosToken, setBosToken] = useState("");
  const [eosToken, setEosToken] = useState("");
  const [addGenerationPrompt, setAddGenerationPrompt] = useState<
    boolean | undefined
  >();
  const [chatTemplate, setChatTemplate] = useState("");
  const [templateEditing, setTemplateEditing] = useState(false);

  useEffect(() => {
    if (modelId) {
      const s = getModelSettings(modelId);
      setDisplayName(s.displayName);
      setSystemPrompt(s.systemPrompt);
      setStopWords(s.stopWords);
      setStopWordDraft("");
      setAddBosToken(s.addBosToken);
      setAddEosToken(s.addEosToken);
      setBosToken(s.bosToken);
      setEosToken(s.eosToken);
      setAddGenerationPrompt(s.addGenerationPrompt);
      setChatTemplate(s.chatTemplate);
      setTemplateEditing(false);
    }
  }, [modelId]);

  function addStopWord(): void {
    const words = parseStopWords(stopWordDraft);
    if (words.length === 0) return;
    setStopWords((prev) => [...new Set([...prev, ...words])]);
    setStopWordDraft("");
  }

  function handleSave(): void {
    if (!modelId) return;
    // A typed-but-not-submitted stop word still saves (PocketPal parity).
    updateModelSettings(modelId, {
      displayName: displayName.trim(),
      systemPrompt,
      stopWords: [...new Set([...stopWords, ...parseStopWords(stopWordDraft)])],
      addBosToken,
      addEosToken,
      bosToken: bosToken.trim(),
      eosToken: eosToken.trim(),
      addGenerationPrompt,
      chatTemplate: chatTemplate.trim(),
    });
    onClose();
  }

  return (
    <Sheet
      visible={modelId !== null}
      onClose={onClose}
      title="Model Settings"
      testID="model-settings-sheet"
    >
      <ScrollView className="max-h-[70%]" contentContainerClassName="gap-4 pb-2">
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

        {/* Stop words: removable chips + add-input (PocketPal parity). */}
        <View>
          <Text className="font-sans text-body-sm text-secondary-text mb-1">Stop words</Text>
          {stopWords.length > 0 ? (
            <View className="flex-row flex-wrap gap-2 mb-2">
              {stopWords.map((word) => (
                <View
                  key={word}
                  className="flex-row items-center gap-1 rounded bg-surface-2 px-2 py-1"
                >
                  <Text className="font-sans text-caption text-secondary-text">{word}</Text>
                  <Pressable
                    onPress={() => setStopWords((prev) => prev.filter((w) => w !== word))}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove stop word ${word}`}
                  >
                    <X size={12} color={colors.secondaryText} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
          <TextInput
            value={stopWordDraft}
            onChangeText={setStopWordDraft}
            onSubmitEditing={addStopWord}
            placeholder={"Add stop word, e.g. <|eot_id|>"}
            className="font-sans text-body-md text-primary-text bg-surface-2 border border-border rounded-lg px-5 py-3"
            placeholderTextColor={colors.secondaryText}
            autoCapitalize="none"
            returnKeyType="done"
            multiline={false}
          />
        </View>

        {/* Token settings (PocketPal ModelSettings parity). The BOS/EOS
            toggles gate whether their token strings join the turn; EOS is
            honored as a stop string, BOS currently only persisted — llama.rn
            applies the GGUF template's own BOS by default. */}
        <View>
          <Text className="font-sans text-body-sm text-secondary-text mb-1">Token settings</Text>
          <ToggleRow
            label="Add BOS token"
            description="Prepend the model's BOS token to the prompt"
            on={addBosToken}
            onPress={() => setAddBosToken((v) => !v)}
          />
          {addBosToken ? (
            <TextInput
              value={bosToken}
              onChangeText={setBosToken}
              placeholder="BOS Token"
              className="font-sans text-body-md text-primary-text bg-surface-2 border border-border rounded-lg px-5 py-3 mb-1"
              placeholderTextColor={colors.secondaryText}
              autoCapitalize="none"
            />
          ) : null}
          <ToggleRow
            label="Add EOS token"
            description="Stop the reply when the EOS token appears"
            on={addEosToken}
            onPress={() => setAddEosToken((v) => !v)}
          />
          {addEosToken ? (
            <TextInput
              value={eosToken}
              onChangeText={setEosToken}
              placeholder="EOS Token"
              className="font-sans text-body-md text-primary-text bg-surface-2 border border-border rounded-lg px-5 py-3 mb-1"
              placeholderTextColor={colors.secondaryText}
              autoCapitalize="none"
            />
          ) : null}
          <ToggleRow
            label="Add generation prompt"
            description="Append the assistant cue the chat template expects"
            // Absent = never overridden = llama.cpp's own default (true).
            on={addGenerationPrompt ?? true}
            onPress={() => setAddGenerationPrompt(!(addGenerationPrompt ?? true))}
          />
        </View>

        {/* Chat template: PocketPal shows a masked preview with an Edit
            affordance; the editor replaces it inline (no inner sheet — the
            template picker registry does not exist on this side). */}
        <View>
          <Text className="font-sans text-body-sm text-secondary-text mb-1">Chat template</Text>
          {templateEditing ? (
            <TextInput
              value={chatTemplate}
              onChangeText={setChatTemplate}
              placeholder="Leave blank to use the model's built-in template"
              className="font-sans text-body-md text-primary-text bg-surface-2 border border-border rounded-lg px-5 py-3"
              placeholderTextColor={colors.secondaryText}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              autoCapitalize="none"
            />
          ) : (
            <Text
              numberOfLines={2}
              className="font-sans text-body-md text-secondary-text"
            >
              {chatTemplate.trim() === ""
                ? "Model default"
                : chatTemplate.trim()}
            </Text>
          )}
          <Pressable
            onPress={() => setTemplateEditing((v) => !v)}
            className="mt-2 self-start rounded-lg border border-border px-4 py-2"
            accessibilityRole="button"
            accessibilityLabel={templateEditing ? "Done editing template" : "Edit chat template"}
          >
            <Text className="font-sans text-body-sm text-primary">
              {templateEditing ? "Done" : "Edit"}
            </Text>
          </Pressable>
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
      </ScrollView>
    </Sheet>
  );
}
