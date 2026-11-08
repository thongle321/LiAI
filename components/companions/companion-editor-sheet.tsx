/** Unified companion editor (PocketPal's PalSheet, local layer).
 *
 * One sheet for create AND edit: identity, system prompt (a Mustache
 * template when the companion is parameterized — parsed on Save, rendered at
 * completion time), dynamic parameter values, talents (PACT), greeting +
 * suggested prompts, color, recommended model, and the nested per-companion
 * generation settings. Delete lives in the actions row for edits.
 *
 * NOT ported (decided): thumbnail images (carried, unused). Video template: none.
 * AI prompt generation: IMPLEMENTED (useAIPrompt, promptGenerationModel, generatingPrompt).
 */

import { useEffect, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

import { Sheet } from "@/components/sheet.tsx";
import {
  ActionRow,
  RowSizeProvider,
  SettingsSection,
  ToggleRow,
} from "@/components/settings-rows.tsx";
import { CompanionTextRow } from "./companion-text-row.tsx";
import { DynamicParameterFields } from "./dynamic-parameter-fields.tsx";
import { ModelSelector } from "./model-selector.tsx";
import { ThumbnailPicker } from "./thumbnail-picker.tsx";
import { generateFinalSystemPrompt } from "@/utils/companion-template.ts";
import { TALENT_NAMES } from "@/services/agent/registry.ts";
import { talentDescription, talentLabel } from "@/services/companions/talent-display.ts";
import {
  buildCompanionFields,
  type CompanionEditorDraft,
} from "@/services/companions/editor-draft.ts";
import { buildGenerationPrompt, GENERATION_SCHEMA } from "@/services/companions/ai-prompt-generation.ts";
import { resolveCompanionModelStatus } from "@/services/companions/model-availability.ts";
import { formatBytes } from "@/services/models/progress.ts";
import { shareCompanions } from "@/services/companions/share-companions.ts";
import { useCompanions } from "@/store/companions.ts";
import { useModelStore } from "@/store/model-store.ts";
import type { Companion } from "@/types/companion.ts";
import { CompanionGenerationSettingsSheet } from "./companion-generation-settings-sheet.tsx";
import { useStructuredOutput } from "@/hooks/useStructuredOutput.ts";

/** Preset card colors — PocketPal ships preset gradients; without a
 *  gradient library the pair is kept (accent strip on the card) and
 *  picked from the same kind of curated list. */
const COLOR_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["#0E0D0C", "#FAFAFA"],
  ["#9E204F", "#F6E1EA"],
  ["#1D4ED8", "#DBEAFE"],
  ["#047857", "#D1FAE5"],
  ["#B45309", "#FEF3C7"],
];

/** A draft companion: everything the form edits, id only in edit mode. */
type EditorDraft = CompanionEditorDraft;

function draftFrom(companion: Partial<Companion> | null): EditorDraft {
  const p = companion ?? {};
  return {
    id: p.id ?? null,
    name: p.name ?? "",
    description: p.description ?? "",
    thumbnail: p.thumbnail_url ?? "",
    // The TEMPLATE is what gets edited and stored (rendered at
    // completion time); the pristine copy anchors "changed?" detection.
    systemPrompt: p.systemPrompt ?? "",
    originalSystemPrompt: p.originalSystemPrompt ?? p.systemPrompt ?? "",
    isSystemPromptChanged: p.isSystemPromptChanged ?? false,
    parameters: { ...(p.parameters ?? {}) },
    parameterSchema: p.parameterSchema ?? [],
    talentNames: new Set((p.pact?.talents ?? []).map((t) => t.name)),
    greetingText: p.greeting?.text ?? "",
    suggestedPrompts: (p.greeting?.suggestedPrompts ?? []).join("\n"),
    color: p.color ?? null,
    modelRef: p.defaultModel ?? null,
    completionSettings: p.completionSettings ?? null,
    // The form never edits capabilities; carrying the stored value is what
    // keeps an edit from resetting it (PocketPal: `pal.capabilities || {}`).
    capabilities: p.capabilities ?? {},
    // AI prompt generation
    useAIPrompt: p.useAIPrompt ?? false,
    promptGenerationModel: p.promptGenerationModel ?? null,
    generatingPrompt: p.generatingPrompt ?? "",
  };
}

export function CompanionEditorSheet({
  companion,
  onClose,
}: {
  /** The companion being created (template, no id) or edited — null closes. */
  companion: Partial<Companion> | null;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<EditorDraft>(() => draftFrom(companion));
  const [genVisible, setGenVisible] = useState(false);
  const [generating, setGenerating] = useState(false);
  const createCompanion = useCompanions((s) => s.createCompanion);
  const updateCompanion = useCompanions((s) => s.updateCompanion);
  const deleteCompanion = useCompanions((s) => s.deleteCompanion);
  // The STORED companion (with id) for export — the draft has no timestamps.
  const storedCompanion = useCompanions((s) =>
    draft.id === null ? undefined : s.companions.find((p) => p.id === draft.id),
  );
  const models = useModelStore((s) => s.models);
  const presets = useModelStore((s) => s.presets);
  const startDownload = useModelStore((s) => s.startDownload);
  const downloaded = models.filter((m) => m.downloadStatus === "completed");
  // PocketPal's ModelNotAvailable: a linked model that is not on this phone.
  const modelStatus = resolveCompanionModelStatus(draft.modelRef, models, presets);

  // AI Prompt Generation hook
  const { generate, isGenerating, isBusy, stop, error } = useStructuredOutput();

  useEffect(() => {
    if (companion !== null) setDraft(draftFrom(companion));
  }, [companion]);

  const patch = (p: Partial<EditorDraft>) => setDraft((d) => ({ ...d, ...p }));

  const isEdit = draft.id !== null;
  const canSave = draft.name.trim() !== "";
  /** One fallback for a companion that has no name yet, shared by the editor
   *  title and the nested generation sheet. */
  const displayName = draft.name.trim() || "Untitled";

  async function save(): Promise<void> {
    if (!canSave) return;
    const fields = buildCompanionFields(draft);
    // On update the clearable fields travel as `null` when empty, which is
    // the repository's erase signal (`undefined` would leave the stored
    // value in place). A create omits them instead.
    const saved =
      isEdit && draft.id !== null
        ? await updateCompanion(draft.id, {
            ...fields.base,
            greeting: fields.greeting,
            defaultModel: fields.defaultModel,
            description: fields.description,
            completionSettings: fields.completionSettings,
            thumbnail_url: fields.thumbnail,
          })
        : await createCompanion({
            ...fields.base,
            ...(fields.greeting !== null ? { greeting: fields.greeting } : {}),
            ...(fields.defaultModel !== null ? { defaultModel: fields.defaultModel } : {}),
            ...(fields.description !== null ? { description: fields.description } : {}),
            ...(fields.completionSettings !== null
              ? { completionSettings: fields.completionSettings }
              : {}),
            ...(fields.thumbnail !== null ? { thumbnail_url: fields.thumbnail } : {}),
          });
    // A null write means the store could not reach storage (it swallows the
    // error). Closing here would discard everything the user just typed.
    if (saved === null) {
      Alert.alert("Couldn't save companion", "Storage isn't ready. Try again.");
      return;
    }
    onClose();
  }

  function remove(): void {
    if (!isEdit || draft.id === null) return;
    const id = draft.id;
    Alert.alert("Delete companion?", `"${draft.name}" will be removed from this device.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void deleteCompanion(id).then((ok) => {
            if (ok) onClose();
            else
              Alert.alert(
                "Couldn't delete companion",
                "Storage isn't ready. Try again.",
              );
          });
        },
      },
    ]);
  }

  const renderedPreview =
    draft.parameterSchema.length > 0
      ? generateFinalSystemPrompt(draft.systemPrompt, draft.parameters)
      : draft.systemPrompt;

  // PocketPal parity: use Sheet.Actions as a child component for proper scrolling
  return (
    <Sheet
      visible={companion !== null}
      onClose={onClose}
      title={isEdit ? `Edit Companion: ${displayName}` : "New Companion"}
      testID="companion-editor-sheet"
    >
      <RowSizeProvider label="text-body-md" desc="text-body-sm">
        <CompanionTextRow
          label="Name"
          value={draft.name}
          placeholder="e.g. Pip, Sage, River"
          onChangeText={(name) => patch({ name })}
        />
        <CompanionTextRow
          label="Description"
          value={draft.description}
          placeholder="What this companion is for"
          onChangeText={(description) => patch({ description })}
        />
        <ThumbnailPicker
          value={draft.thumbnail}
          onChange={(thumbnail) => patch({ thumbnail })}
          onClear={() => patch({ thumbnail: "" })}
        />
        <CompanionTextRow
          label="System prompt"
          description={
            draft.parameterSchema.length > 0
              ? "A Mustache template: {{key}} placeholders render with the parameter values below."
              : undefined
          }
          value={draft.systemPrompt}
          placeholder="You are…"
          multiline
          onChangeText={(systemPrompt) => patch({ systemPrompt })}
        />
        {/* AI Prompt Generation */}
        <SettingsSection plain>
          <ToggleRow
            label="Generate with AI"
            description="Use an AI model to generate the system prompt from your instructions."
            on={draft.useAIPrompt}
            onPress={() => patch({ useAIPrompt: !draft.useAIPrompt })}
          />
          {draft.useAIPrompt ? (
            <>
              <ModelSelector
                value={draft.promptGenerationModel}
                onChange={(model) => patch({ promptGenerationModel: model })}
                label="Generation Model"
                placeholder="Select model"
              />
              <CompanionTextRow
                label="Instructions"
                description="Describe what kind of companion you want. The AI will generate a system prompt."
                value={draft.generatingPrompt}
                placeholder="e.g. A helpful coding assistant that explains concepts clearly"
                multiline
                onChangeText={(generatingPrompt) => patch({ generatingPrompt })}
              />
              <Pressable
                onPress={async () => {
                  if (!draft.generatingPrompt.trim()) {
                    Alert.alert("No instructions", "Please describe what kind of companion you want.");
                    return;
                  }
                  if (!draft.promptGenerationModel) {
                    Alert.alert("No model selected", "Please select a generation model.");
                    return;
                  }
                  setGenerating(true);
                  try {
                    const prompt = buildGenerationPrompt(draft.generatingPrompt, draft.promptGenerationModel);
                    const result = await generate(prompt, GENERATION_SCHEMA);
                    const generatedPrompt = result?.prompt as string | undefined;
                    if (generatedPrompt) {
                      patch({ systemPrompt: generatedPrompt });
                      // Only set originalSystemPrompt if it's not already set
                      const currentOriginal = draft.originalSystemPrompt || draft.systemPrompt;
                      if (!currentOriginal || currentOriginal === draft.systemPrompt) {
                        patch({ originalSystemPrompt: generatedPrompt });
                      }
                      patch({ isSystemPromptChanged: false });
                    } else {
                      Alert.alert("Generation failed", "The model did not return a valid prompt. Try again.");
                    }
                  } catch {
                    Alert.alert("Generation error", error ?? "Failed to generate prompt. Try again.");
                  } finally {
                    setGenerating(false);
                  }
                }}
                disabled={isGenerating || isBusy || !draft.generatingPrompt.trim() || !draft.promptGenerationModel}
                className="mt-2 min-h-10 items-center justify-center rounded-lg bg-primary px-4 active:opacity-80"
                accessibilityRole="button"
                accessibilityLabel="Generate system prompt with AI"
              >
                <Text className="text-action">{isGenerating ? "Generating…" : "Generate"}</Text>
              </Pressable>
            </>
          ) : null}
        </SettingsSection>
        {draft.parameterSchema.length > 0 ? (
            <DynamicParameterFields
              schema={draft.parameterSchema}
              values={draft.parameters}
              onChange={(key, value) =>
                patch({ parameters: { ...draft.parameters, [key]: value } })
              }
            />
          ) : null}
        {/* Preview so a templated prompt is inspectable without a chat. */}
        {draft.parameterSchema.length > 0 && renderedPreview !== draft.systemPrompt ? (
          <View className="mb-5 rounded-lg border border-border bg-surface-2 p-3">
            <Text className="text-body-sm text-secondary-text" selectable>
              {renderedPreview}
            </Text>
          </View>
        ) : null}

        <Text className="mb-2 font-sans-semibold text-body-md text-primary-text">
          Tools
        </Text>
        {/* Tools offered in this companion's chats only. */}
        <SettingsSection plain>
          {TALENT_NAMES.map((name) => (
            <ToggleRow
              key={name}
              label={talentLabel(name)}
              description={talentDescription(name)}
              on={draft.talentNames.has(name)}
              onPress={() => {
                const next = new Set(draft.talentNames);
                if (next.has(name)) next.delete(name);
                else next.add(name);
                patch({ talentNames: next });
              }}
            />
          ))}
        </SettingsSection>

        <Text className="mb-2 font-sans-semibold text-body-md text-primary-text">
          Greeting
        </Text>
        <CompanionTextRow
          label="Greeting message"
          description="Shown as a bubble on an empty chat — never sent to the model."
          value={draft.greetingText}
          placeholder="Hi, I'm …"
          multiline
          onChangeText={(greetingText) => patch({ greetingText })}
        />
        <CompanionTextRow
          label="Suggested prompts"
          description="One per line — tappable chips above the composer while the chat is empty."
          value={draft.suggestedPrompts}
          multiline
          onChangeText={(suggestedPrompts) => patch({ suggestedPrompts })}
        />

        <Text className="mb-2 font-sans-semibold text-body-md text-primary-text">
          Color
        </Text>
        <View className="mb-5 flex-row gap-2">
          {COLOR_PAIRS.map((pair) => {
            const selected = draft.color?.[0] === pair[0];
            return (
              <Pressable
                key={pair[0]}
                onPress={() => patch({ color: [...pair] as [string, string] })}
                className={`h-10 flex-1 overflow-hidden rounded-lg border-2 ${
                  selected ? "border-primary" : "border-border"
                }`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`Color ${pair[0]}`}
              >
                <View className="h-1/2" style={{ backgroundColor: pair[0] }} />
                <View className="h-1/2" style={{ backgroundColor: pair[1] }} />
              </Pressable>
            );
          })}
        </View>

        <Text className="mb-2 font-sans-semibold text-body-md text-primary-text">
          Model
        </Text>
        {downloaded.length === 0 ? (
          <Text className="mb-2 text-body-sm text-quiet">No downloaded models yet.</Text>
        ) : (
          <ModelSelector
            value={draft.modelRef}
            onChange={(model) => patch({ modelRef: model })}
            label="Default Model"
            placeholder="Select model"
          />
        )}

        {modelStatus.state === "downloadable" ? (
          <View className="mb-5 rounded-lg border border-border bg-surface-1 p-3">
            <Text className="text-body-sm text-secondary-text">
              Recommended model: {modelStatus.name} ({formatBytes(modelStatus.size)})
            </Text>
            <Pressable
              onPress={() =>
                void startDownload(modelStatus.presetId, modelStatus.file)
              }
              className="mt-2 min-h-10 items-center justify-center rounded-lg bg-primary px-3 active:opacity-80"
              accessibilityRole="button"
              accessibilityLabel={`Download ${modelStatus.name}`}
            >
              <Text className="text-body-sm text-on-primary">Download</Text>
            </Pressable>
          </View>
        ) : modelStatus.state === "downloading" ? (
          <Text className="mb-5 text-body-sm text-secondary-text">
            Downloading {draft.modelRef?.name ?? "the model"}…{" "}
            {Math.round(modelStatus.progress)}%
          </Text>
        ) : modelStatus.state === "unavailable" ? (
          <Text className="mb-5 text-body-sm text-quiet">
            “{modelStatus.name}” isn’t in the catalog any more. Pick a downloaded
            model above.
          </Text>
        ) : null}

        <Pressable
          onPress={() => setGenVisible(true)}
          className="mb-2 min-h-12 flex-row items-center justify-between rounded-lg border border-border bg-surface-1 px-3"
          accessibilityRole="button"
          accessibilityLabel="Generation settings"
        >
          <Text className="text-body-md text-primary-text">Generation settings</Text>
          <Text className="text-body-sm text-quiet">
            {draft.completionSettings
              ? `${Object.keys(draft.completionSettings).length} overridden`
              : "Follow preset"}
          </Text>
        </Pressable>
        {isEdit && storedCompanion !== undefined ? (
          <ActionRow
            label="Export this companion"
            description="Share as .json file."
            buttonLabel="Share"
            variant="secondary"
            onPress={() => {
              void shareCompanions([storedCompanion]).catch((err: unknown) => {
                Alert.alert(
                  "Export failed",
                  err instanceof Error ? err.message : String(err),
                );
              });
            }}
          />
        ) : null}
      </RowSizeProvider>

      {/* PocketPal parity: Sheet.Actions rendered as child for proper scroll behavior */}
      <Sheet.Actions>
        <View className="flex-row items-center justify-between">
          {isEdit ? (
            <Pressable
              onPress={remove}
              className="min-h-12 justify-center"
              accessibilityRole="button"
              accessibilityLabel="Delete companion"
            >
              <Text className="text-body text-danger">Delete</Text>
            </Pressable>
          ) : (
            <View />
          )}
          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={onClose}
              className="btn btn--secondary active:opacity-80"
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text className="text-body">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => void save()}
              disabled={!canSave}
              className={`btn btn--primary active:opacity-80${canSave ? "" : " opacity-40"}`}
              accessibilityRole="button"
              accessibilityLabel="Save companion"
            >
              <Text className="text-action">Save</Text>
            </Pressable>
          </View>
        </View>
      </Sheet.Actions>

      <CompanionGenerationSettingsSheet
        visible={genVisible}
        name={displayName}
        base={draft.completionSettings}
        onClose={() => setGenVisible(false)}
        onSave={(completionSettings) => {
          patch({ completionSettings });
          setGenVisible(false);
        }}
      />
    </Sheet>
  );
}
