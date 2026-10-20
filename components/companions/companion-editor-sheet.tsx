/** Unified companion editor (PocketPal's PalSheet, local layer).
 *
 * One sheet for create AND edit: identity, system prompt (a Mustache
 * template when the companion is parameterized — parsed on Save, rendered at
 * completion time), dynamic parameter values, talents (PACT), greeting +
 * suggested prompts, color, recommended model, and the nested per-companion
 * generation settings. Delete lives in the actions row for edits.
 *
 * NOT ported (decided): AI prompt generation (useAIPrompt is carried,
 * never written) and thumbnail images. Video template: none.
 */

import { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import { useColors } from "@/themes/tokens.ts";
import { Sheet } from "@/components/sheet.tsx";
import {
  ActionRow,
  RowLabel,
  RowSizeProvider,
  SettingsSection,
  ToggleRow,
} from "@/components/settings-rows.tsx";
import { SamplerRows } from "@/components/chat/sampler-rows.tsx";
import {
  DEFAULT_SAMPLER,
  resolveSampler,
  type SamplerParams,
} from "@/services/inference/sampler.ts";
import {
  generateFinalSystemPrompt,
  parseCompanionTemplate,
} from "@/utils/companion-template.ts";
import { TALENT_NAMES } from "@/services/agent/registry.ts";
import { shareCompanions } from "@/services/companions/share-companions.ts";
import { useCompanions } from "@/store/companions.ts";
import { useModelStore } from "@/store/modelStore.ts";
import type { Companion, CompanionModelRef, ParameterDefinition } from "@/types/companion.ts";

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

function CompanionTextRow({
  label,
  description,
  value,
  placeholder,
  multiline,
  onChangeText,
}: {
  label: string;
  description?: string;
  value: string;
  placeholder?: string;
  multiline?: boolean;
  onChangeText: (text: string) => void;
}) {
  const colors = useColors();
  return (
    <View className="mb-5">
      <RowLabel label={label} description={description} />
      <TextInput
        value={value}
        placeholder={placeholder}
        placeholderTextColor={colors.secondaryTextMuted}
        multiline={multiline}
        onChangeText={onChangeText}
        className={`min-h-10 rounded-lg border border-border bg-surface-1 px-3 py-2 font-sans text-body-md text-primary-text${
          multiline ? " min-h-28" : ""
        }`}
        accessibilityLabel={label}
      />
    </View>
  );
}

/** A draft companion: everything the form edits, id only in edit mode. */
interface EditorDraft {
  id: string | null;
  name: string;
  description: string;
  systemPrompt: string;
  originalSystemPrompt: string;
  parameters: Record<string, unknown>;
  parameterSchema: ParameterDefinition[];
  talentNames: Set<string>;
  greetingText: string;
  suggestedPrompts: string;
  color: readonly [string, string] | null;
  modelRef: CompanionModelRef | null;
  completionSettings: Partial<SamplerParams> | null;
}

function draftFrom(companion: Partial<Companion> | null): EditorDraft {
  const p = companion ?? {};
  return {
    id: p.id ?? null,
    name: p.name ?? "",
    description: p.description ?? "",
    // The TEMPLATE is what gets edited and stored (rendered at
    // completion time); the pristine copy anchors "changed?" detection.
    systemPrompt: p.systemPrompt ?? "",
    originalSystemPrompt: p.originalSystemPrompt ?? p.systemPrompt ?? "",
    parameters: { ...(p.parameters ?? {}) },
    parameterSchema: p.parameterSchema ?? [],
    talentNames: new Set((p.pact?.talents ?? []).map((t) => t.name)),
    greetingText: p.greeting?.text ?? "",
    suggestedPrompts: (p.greeting?.suggestedPrompts ?? []).join("\n"),
    color: p.color ?? null,
    modelRef: p.defaultModel ?? null,
    completionSettings: p.completionSettings ?? null,
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
  const createCompanion = useCompanions((s) => s.createCompanion);
  const updateCompanion = useCompanions((s) => s.updateCompanion);
  const deleteCompanion = useCompanions((s) => s.deleteCompanion);
  // The STORED companion (with id) for export — the draft has no timestamps.
  const storedCompanion = useCompanions((s) =>
    draft.id === null ? undefined : s.companions.find((p) => p.id === draft.id),
  );
  const models = useModelStore((s) => s.models);
  const downloaded = models.filter((m) => m.downloadStatus === "completed");

  useEffect(() => {
    if (companion !== null) setDraft(draftFrom(companion));
  }, [companion]);

  const patch = (p: Partial<EditorDraft>) => setDraft((d) => ({ ...d, ...p }));

  const isEdit = draft.id !== null;
  const canSave = draft.name.trim() !== "";

  async function save(): Promise<void> {
    if (!canSave) return;
    // Template pass: a schema block in the prompt defines the parameters
    // (roleplay ships one); entered values win over schema defaults.
    const parsed = parseCompanionTemplate(draft.systemPrompt);
    const schema = parsed.parameterSchema.length > 0 ? parsed.parameterSchema : draft.parameterSchema;
    const parameters: Record<string, unknown> = { ...parsed.defaultParameters };
    for (const key of Object.keys(parameters)) {
      const entered = draft.parameters[key];
      if (typeof entered === "string" && entered !== "") parameters[key] = entered;
    }
    const talents = [...draft.talentNames]
      .filter((name) => (TALENT_NAMES as readonly string[]).includes(name))
      .map((name) => ({ name, necessity: "required" as const }));
    // `null` ERASES the greeting on update (the repo's clearable gate);
    // a create has nothing to erase, and the Companion type takes undefined.
    const greeting =
      draft.greetingText.trim() !== ""
        ? {
            text: draft.greetingText.trim(),
            suggestedPrompts: draft.suggestedPrompts
              .split("\n")
              .map((s) => s.trim())
              .filter((s) => s !== ""),
          }
        : null;
    const base = {
      type: "local" as const,
      name: draft.name.trim(),
      description: draft.description.trim() || undefined,
      systemPrompt: draft.systemPrompt,
      originalSystemPrompt: draft.originalSystemPrompt || draft.systemPrompt,
      isSystemPromptChanged:
        draft.systemPrompt !== (draft.originalSystemPrompt || draft.systemPrompt),
      useAIPrompt: false,
      parameters,
      parameterSchema: schema,
      capabilities: {},
      source: "local" as const,
      pact: { talents },
      color: (draft.color as [string, string] | null) ?? undefined,
      defaultModel: draft.modelRef ?? undefined,
      completionSettings: draft.completionSettings ?? undefined,
    };
    if (isEdit && draft.id !== null) {
      await updateCompanion(draft.id, { ...base, greeting });
    } else {
      await createCompanion({
        ...base,
        ...(greeting !== null ? { greeting } : {}),
      });
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
          void deleteCompanion(id).then(() => onClose());
        },
      },
    ]);
  }

  const renderedPreview =
    draft.parameterSchema.length > 0
      ? generateFinalSystemPrompt(draft.systemPrompt, draft.parameters)
      : draft.systemPrompt;

  return (
    <Sheet
      visible={companion !== null}
      onClose={onClose}
      title={isEdit ? `Edit Companion: ${draft.name || "Untitled"}` : "New Companion"}
      actions={
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
      }
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
        {draft.parameterSchema.length > 0 ? (
          <>
            <Text className="mb-2 font-sans-semibold text-body-md text-primary-text">
              Parameters
            </Text>
            <SettingsSection plain>
              {draft.parameterSchema.map((param) => (
                <CompanionTextRow
                  key={param.key}
                  label={param.label}
                  description={param.description}
                  value={String(draft.parameters[param.key] ?? "")}
                  placeholder={param.placeholder}
                  onChangeText={(value) =>
                    patch({ parameters: { ...draft.parameters, [param.key]: value } })
                  }
                />
              ))}
            </SettingsSection>
          </>
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
        <Text className="mb-2 text-body-sm text-secondary-text">
          Only this companion&apos;s tools are offered in its chats — a conversation
          with no companion has none.
        </Text>
        <SettingsSection plain>
          {TALENT_NAMES.map((name) => (
            <ToggleRow
              key={name}
              label={name.replace("_", " ")}
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
        <Text className="mb-2 text-body-sm text-secondary-text">
          Recommended model for this companion. Nothing is pinned: chat keeps
          whatever is active unless you switch.
        </Text>
        <View className="mb-2 flex-row flex-wrap gap-2">
          {downloaded.length === 0 ? (
            <Text className="text-body-sm text-quiet">No downloaded models yet.</Text>
          ) : (
            [
              { id: "", label: "None" },
              ...downloaded.map((m) => ({ id: m.id, label: m.name })),
            ].map((option) => {
              const selected = (draft.modelRef?.id ?? "") === option.id;
              return (
                <Pressable
                  key={option.id || "none"}
                  onPress={() => {
                    const model = downloaded.find((m) => m.id === option.id);
                    patch({
                      modelRef: model
                        ? {
                            id: model.id,
                            name: model.name,
                            author: model.author,
                            ...(model.files[0]
                              ? {
                                  file: {
                                    name: model.files[0].name,
                                    size: model.files[0].size,
                                  },
                                }
                              : {}),
                          }
                        : null,
                    });
                  }}
                  className={`min-h-9 rounded-full border px-3 justify-center ${
                    selected ? "border-primary bg-primary" : "border-border bg-surface-1"
                  }`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text className={selected ? "text-body-sm text-on-primary" : "text-body-sm text-primary-text"}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })
          )}
        </View>
        {draft.modelRef !== null &&
        !downloaded.some((m) => m.id === draft.modelRef?.id) ? (
          <Text className="mb-3 text-body-sm text-quiet">
            {draft.modelRef.name} isn&apos;t downloaded — find it in Models.
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
            description="Share it as a .json file — importing it restores the companion."
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
      <CompanionGenerationSettingsSheet
        visible={genVisible}
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

/** Per-companion generation settings (PocketPal's PalGenerationSettingsSheet):
 *  a partial sampler layered over the global preset when this companion's
 *  session follows it. Edits buffer in a draft; Save hands the partial
 *  back — Reset clears it entirely (back to "follow preset"). */
function CompanionGenerationSettingsSheet({
  visible,
  base,
  onClose,
  onSave,
}: {
  visible: boolean;
  base: Partial<SamplerParams> | null;
  onClose: () => void;
  onSave: (settings: Partial<SamplerParams> | null) => void;
}) {
  const [draft, setDraft] = useState<SamplerParams>(() =>
    resolveSampler(DEFAULT_SAMPLER, base),
  );
  useEffect(() => {
    if (visible) setDraft(resolveSampler(DEFAULT_SAMPLER, base));
  }, [visible, base]);

  function partialFrom(full: SamplerParams): Partial<SamplerParams> {
    // Only fields that differ from the DEFAULTS are stored — a companion that
    // merely confirms defaults should not pin them against future
    // preset changes (the same partial contract the session override
    // keeps).
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(DEFAULT_SAMPLER) as Array<keyof SamplerParams>) {
      if (full[key] !== DEFAULT_SAMPLER[key]) out[key] = full[key];
    }
    return out as Partial<SamplerParams>;
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Companion Generation Settings"
      actions={
        <View className="flex-row items-center justify-between">
          <Pressable
            onPress={() => onSave(null)}
            className="min-h-12 justify-center"
            accessibilityRole="button"
            accessibilityLabel="Reset to preset"
          >
            <Text className="text-body">Reset to preset</Text>
          </Pressable>
          <Pressable
            onPress={() => onSave(partialFrom(draft))}
            className="btn btn--primary active:opacity-80"
            accessibilityRole="button"
            accessibilityLabel="Save"
          >
            <Text className="text-action">Save</Text>
          </Pressable>
        </View>
      }
    >
      <SettingsSection plain>
        <SamplerRows
          sampler={draft}
          jinjaEnabled={false}
          onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
          onJinjaChange={() => {}}
        />
      </SettingsSection>
      {/* JINJA is global, not per-companion — the row is part of the shared
          component, so it is rendered inert here. */}
      <View className="pointer-events-none mb-2 opacity-0" collapsable={false}>
        <Switch value={false} onValueChange={() => {}} />
      </View>
    </Sheet>
  );
}
