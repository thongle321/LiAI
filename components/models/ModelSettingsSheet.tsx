/** Per-model settings: name, tokens, system prompt, template, stop words,
 * multimodal pair, reasoning — PocketPal parity end to end
 * (ModelSettingsSheet.tsx + ModelSettings.tsx).
 *
 * THE CLIP FIX, one line with a long history: this sheet used to render
 * its OWN ScrollView (`max-h-[70%]`) inside the shared Sheet, which
 * already scrolls. Two nested scrollers meant the sheet's auto detent
 * measured a height that clipped the lower half of the content — on
 * device: rows cut mid-"Add EOS token", a dead white area below, and a
 * Save button that could never be reached. The shared Sheet IS the
 * scroller now; nothing nests inside it.
 *
 * Section order and copy follow PocketPal: Model Name → token settings
 * (BOS/EOS/Add Generation Prompt, each with a conditional token field) →
 * System prompt → Template row → STOP WORDS → Multimodal Settings (vision
 * models only) → Reasoning (always) → Reset / Cancel / Save Changes.
 *
 * No generation settings here, deliberately: sampling is per conversation
 * (PocketPal's own split), reached from the chat screen's "Generation
 * settings" menu.
 *
 * Save model, matching PocketPal exactly: every edit lands in temp state
 * first; Cancel / X / a swipe discards it; "Save Changes" writes. Reset is
 * the one immediate action (it restores defaults and resyncs temp state).
 * The Reasoning section is the exception — its switches write through to
 * the inference store as they are flipped, the same live contract the
 * composer pill already has, so a thinking change never depends on
 * remembering to press Save.
 *
 * Remote models show ONLY the Reasoning section (PocketPal's !isRemote
 * guards): there is no local GGUF to name, prompt or template.
 */

import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { X } from "lucide-react-native";

import { useModelStore } from "../../store/modelStore";
import { useInference } from "../../store/inference.ts";
import { Sheet } from "../Sheet.tsx";
import { ToggleRow } from "../SettingsRows.tsx";
import { ChatTemplateDialog } from "./ChatTemplateDialog.tsx";
import { ModelMultimodalSection } from "./ModelMultimodalSection.tsx";
import { DEFAULT_MODEL_SETTINGS } from "../../lib/model-settings";
import type { ChatTemplatePreset } from "../../lib/chat-templates.ts";
import { resolveThinking } from "../../lib/inference/thinking.ts";
import {
  DEFAULT_EFFORT_LEVEL,
  EFFORT_LABELS,
  EFFORT_LEVELS,
} from "../../lib/reasoning-capability.ts";
import { colors } from "../../themes/tokens.ts";

/** Section header (PocketPal's bold 18px section titles). */
function SectionTitle({ children }: { children: string }) {
  return (
    <Text className="mt-2 font-sans-semibold text-body-lg text-primary-text">
      {children}
    </Text>
  );
}

/** A labelled text field, PocketPal's shape: label above, field below. */
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View className="mt-3">
      <Text className="mb-1 font-sans text-body-sm text-secondary-text">
        {label}
      </Text>
      {children}
    </View>
  );
}

const INPUT =
  "rounded-lg border border-border bg-surface-2 px-4 py-3 font-sans text-body-md text-primary-text";

/** One pasted stop word, or a comma/newline-separated list of them —
 *  PocketPal submits one trimmed word per return key, and this field also
 *  accepts a pasted list. One definition, called from both the add path
 *  and the save path (a typed-but-unsubmitted word still saves). */
function parseStopWords(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((w) => w.trim())
    .filter((w) => w !== "");
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
  // The spec carries origin (remote guard) and the projector candidates.
  const spec = useModelStore((s) =>
    modelId === null ? undefined : s.models.find((m) => m.id === modelId),
  );
  const setThinkingOverride = useInference((s) => s.setThinkingOverride);
  const thinkingOverrides = useInference((s) => s.thinkingOverrides);
  const setEffortOverride = useInference((s) => s.setEffortOverride);
  const effortOverrides = useInference((s) => s.effortOverrides);

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
  const [templateName, setTemplateName] = useState("custom");
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);

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
      setTemplateName(s.templateName ?? "custom");
      setTemplateDialogOpen(false);
    }
  }, [modelId]);

  const isRemote = spec?.origin === "remote_api";

  function addStopWord(): void {
    const words = parseStopWords(stopWordDraft);
    if (words.length === 0) return;
    setStopWords((prev) => [...new Set([...prev, ...words])]);
    setStopWordDraft("");
  }

  /** The template config as one value — the preset dialog edits exactly
   *  this, and Save writes it back across the individual fields. */
  function templateConfig(): ChatTemplatePreset {
    return {
      name: templateName,
      addBosToken,
      addEosToken,
      bosToken,
      eosToken,
      addGenerationPrompt: addGenerationPrompt ?? true,
      systemPrompt,
      chatTemplate,
    };
  }

  function applyTemplateConfig(next: ChatTemplatePreset): void {
    setTemplateName(next.name);
    setAddBosToken(next.addBosToken);
    setAddEosToken(next.addEosToken);
    setBosToken(next.bosToken);
    setEosToken(next.eosToken);
    setAddGenerationPrompt(next.addGenerationPrompt);
    setSystemPrompt(next.systemPrompt);
    setChatTemplate(next.chatTemplate);
  }

  function handleSave(): void {
    if (!modelId || isRemote) return;
    // A typed-but-not-submitted stop word still saves (PocketPal parity).
    updateModelSettings(modelId, {
      displayName: displayName.trim(),
      systemPrompt,
      stopWords: [...new Set([...stopWords, ...parseStopWords(stopWordDraft)])],
      templateName,
      addBosToken,
      addEosToken,
      bosToken: bosToken.trim(),
      eosToken: eosToken.trim(),
      addGenerationPrompt,
      chatTemplate: chatTemplate.trim(),
    });
    onClose();
  }

  /** PocketPal's Reset: defaults persist immediately and the temp state
   *  resyncs to match, so the sheet still shows what is now stored. */
  function handleReset(): void {
    if (!modelId || isRemote) return;
    updateModelSettings(modelId, { ...DEFAULT_MODEL_SETTINGS });
    setDisplayName(DEFAULT_MODEL_SETTINGS.displayName);
    setSystemPrompt(DEFAULT_MODEL_SETTINGS.systemPrompt);
    setStopWords([]);
    setStopWordDraft("");
    setAddBosToken(false);
    setAddEosToken(false);
    setBosToken("");
    setEosToken("");
    setAddGenerationPrompt(undefined);
    setChatTemplate("");
    setTemplateName("custom");
  }

  // Reasoning: axis 1 (on/off) through the thinking override the composer
  // pill already owns; axis 2 (effort) through the per-model level.
  const thinkingOn =
    resolveThinking({
      modelId,
      reasoning: spec?.reasoning,
      overrides: thinkingOverrides,
    }).enabled ?? false;
  const effortLevel = modelId === null ? null : (effortOverrides[modelId] ?? null);
  const effortArmed = effortLevel !== null;

  if (modelId === null) return null;

  const templatePreview = chatTemplate.trim().slice(0, 30);

  return (
    <Sheet
      visible={modelId !== null}
      onClose={onClose}
      title="Model Settings"
      testID="model-settings-sheet"
    >
      {/* Local models only (PocketPal's !isRemote guards). A remote
          endpoint has no GGUF to name, prompt or template — only its
          reasoning posture is ours to configure. */}
      {!isRemote ? (
        <>
          <Field label="Model Name">
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              className={INPUT}
              placeholderTextColor={colors.secondaryText}
              accessibilityLabel="Model name"
            />
          </Field>

          <SectionTitle>Token settings</SectionTitle>
          <View className="mt-2">
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
                className={INPUT}
                placeholderTextColor={colors.secondaryText}
                autoCapitalize="none"
                accessibilityLabel="BOS token"
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
                className={INPUT}
                placeholderTextColor={colors.secondaryText}
                autoCapitalize="none"
                accessibilityLabel="EOS token"
              />
            ) : null}
            <ToggleRow
              label="Add Generation Prompt"
              description="Append the assistant cue the chat template expects"
              // Absent = never overridden = llama.cpp's own default (true).
              on={addGenerationPrompt ?? true}
              onPress={() => setAddGenerationPrompt(!(addGenerationPrompt ?? true))}
            />
          </View>

          <Field label="System Prompt">
            <TextInput
              value={systemPrompt}
              onChangeText={setSystemPrompt}
              placeholder="Personality and instructions for this model"
              className={INPUT}
              placeholderTextColor={colors.secondaryText}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              accessibilityLabel="System prompt"
            />
          </Field>

          {/* Template row: a faded preview with an Edit affordance that
              opens the base-template dialog (PocketPal's MaskedView +
              Edit button, ModelSettings.tsx:133-160). */}
          <View className="mt-3 flex-row items-center justify-between gap-3">
            <View className="flex-1">
              <Text className="font-sans text-body-sm text-secondary-text">
                Template:
              </Text>
              <Text
                numberOfLines={1}
                className="font-mono text-body-sm text-secondary-text"
              >
                {templatePreview === "" ? "Model default" : templatePreview}
              </Text>
            </View>
            <Pressable
              onPress={() => setTemplateDialogOpen(true)}
              className="min-h-11 rounded-lg border border-border px-4 py-2"
              accessibilityRole="button"
              accessibilityLabel="Edit chat template"
            >
              <Text className="font-sans text-body-sm text-primary">Edit</Text>
            </Pressable>
          </View>

          <Field label="STOP WORDS">
            {stopWords.length > 0 ? (
              <View className="mb-2 flex-row flex-wrap gap-2">
                {stopWords.map((word) => (
                  <View
                    key={word}
                    className="flex-row items-center gap-1 rounded bg-surface-2 px-2 py-1"
                  >
                    <Text className="font-sans text-caption text-secondary-text">
                      {word}
                    </Text>
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
              placeholder="Add new stop word"
              className={INPUT}
              placeholderTextColor={colors.secondaryText}
              autoCapitalize="none"
              returnKeyType="done"
              multiline={false}
              accessibilityLabel="Add new stop word"
            />
          </Field>

          {spec?.supportsVision === true ? (
            <View className="mt-4">
              <ModelMultimodalSection model={spec} />
            </View>
          ) : null}
        </>
      ) : null}

      {/* Reasoning — always, including remote models (PocketPal parity). */}
      <SectionTitle>Reasoning</SectionTitle>
      <ToggleRow
        label="Reasoning model"
        description="Show the thinking control for this model, even if it wasn't auto-detected."
        on={thinkingOn}
        onPress={() => setThinkingOverride(modelId, !thinkingOn)}
      />
      {thinkingOn ? (
        <>
          <ToggleRow
            label="Supports graded effort"
            description="Effort levels this model supports"
            on={effortArmed}
            onPress={() =>
              setEffortOverride(
                modelId,
                effortArmed ? null : DEFAULT_EFFORT_LEVEL,
              )
            }
          />
          {effortArmed ? (
            <View className="mt-2 flex-row flex-wrap gap-2">
              {EFFORT_LEVELS.map((level) => {
                const selected = effortLevel === level;
                return (
                  <Pressable
                    key={level}
                    onPress={() => setEffortOverride(modelId, level)}
                    className={`min-h-11 justify-center rounded-full border px-4 ${
                      selected
                        ? "border-primary bg-surface-tint"
                        : "border-border bg-surface-1"
                    }`}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`Effort ${EFFORT_LABELS[level]}`}
                  >
                    <Text
                      className={`font-sans text-body-sm ${
                        selected ? "text-primary" : "text-secondary-text"
                      }`}
                    >
                      {EFFORT_LABELS[level]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </>
      ) : null}

      {/* Footer actions in the scroll body, never TrueSheet's native
          footer: this sheet hosts inputs, and the native footer lifts
          above the keyboard without shrinking the body (Sheet.tsx). */}
      <View className="mt-6 flex-row items-center gap-3">
        {!isRemote ? (
          <Pressable
            onPress={handleReset}
            className="min-h-12 justify-center px-2"
            accessibilityRole="button"
            accessibilityLabel="Reset model settings"
          >
            <Text className="font-sans text-body-md text-secondary-text">
              Reset
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={onClose}
          className="min-h-12 flex-1 justify-center rounded-lg border border-border px-4"
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Text className="text-center font-sans text-body-md text-primary">
            Cancel
          </Text>
        </Pressable>
        {!isRemote ? (
          <Pressable
            onPress={handleSave}
            className="btn btn--primary min-h-12 flex-1"
            accessibilityRole="button"
            accessibilityLabel="Save Changes"
          >
            <Text className="text-center font-sans-semibold text-body-md text-on-primary">
              Save Changes
            </Text>
          </Pressable>
        ) : null}
      </View>

      <ChatTemplateDialog
        visible={templateDialogOpen}
        onClose={() => setTemplateDialogOpen(false)}
        config={templateConfig()}
        onChange={applyTemplateConfig}
      />
    </Sheet>
  );
}
