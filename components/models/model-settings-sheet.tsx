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
 * LAYOUT IS POCKETPAL'S, VERBATIM: Model Name → token settings
 * (BOS / EOS / Add Generation Prompt, each with a conditional token
 * field, hairline divider between every row) → System prompt → Template
 * row → STOP WORDS → Multimodal Settings (vision models only) → Reasoning
 * (always) → Reset / Cancel, then a full-width Save Changes. The
 * reference is Material 3; the SKIN is this app's (DESIGN.md is the
 * authority and wins on every token), so a Paper switch becomes the
 * native @expo/ui switch seeded Signal Blue and a Paper filled input
 * becomes `.input`. Recorded in DESIGN.md: "PocketPal parity" now means
 * structure and copy, never Material components.
 *
 * The token rows carry NO description (PocketPal's rows are bare), which
 * is the one place this sheet departs from DESIGN.md's "every row carries
 * a description" rule — the sheet's own copy matches the reference and
 * the reasoning rows keep the help text PocketPal gives them.
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
import { X, Check } from "lucide-react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { useModelStore } from "../../store/modelStore";
import { useInference } from "../../store/inference.ts";
import { Sheet } from "../sheet.tsx";
import { ToggleRow } from "../settings-rows.tsx";
import { ChatTemplateDialog } from "./chat-template-dialog.tsx";
import { ModelMultimodalSection } from "./model-multimodal-section.tsx";
import { DEFAULT_MODEL_SETTINGS } from "../../utils/model-settings";
import type { ChatTemplatePreset } from "../../utils/chat-templates.ts";
import { resolveThinking } from "../../services/inference/thinking.ts";
import {
  DEFAULT_EFFORT_LEVEL,
  EFFORT_LABELS,
  EFFORT_LEVELS,
} from "../../utils/reasoning-capability.ts";
import { colors } from "../../themes/tokens.ts";

/** PocketPal's 1px hairline Divider between rows. */
function Divider() {
  return <View className="h-px bg-border" />;
}

/** Field label: Body Small in Slate, 8px above the field (DESIGN.md,
 * Inputs). Replaces PocketPal's floating in-field label. */
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View>
      <Text className="mb-2 font-sans text-body-md text-secondary-text">
        {label}
      </Text>
      {children}
    </View>
  );
}

/** The template preview: 30 characters, faded out at the right edge.
 *
 * PocketPal masks this with a MaskedView + LinearGradient so a long
 * Nunjucks template reads as truncated rather than chopped mid-glyph. The
 * same fade is drawn here with react-native-svg's LinearGradient (no new
 * native module) — the one recorded exception to DESIGN.md's no-gradient
 * rule, and a functional mask rather than decoration: it is what says
 * "there is more of this". */
function TemplatePreview({ text }: { text: string }) {
  return (
    <View className="relative h-5 flex-[2] overflow-hidden">
      <Text
        numberOfLines={1}
        className="font-sans text-body-md text-secondary-text"
      >
        {text === "" ? "Model default" : text}
      </Text>
      <View className="absolute inset-0">
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="templateFade" x1="0.7" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={colors.surface1} stopOpacity="0" />
              <Stop offset="1" stopColor={colors.surface1} stopOpacity="1" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#templateFade)" />
        </Svg>
      </View>
    </View>
  );
}

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
      actions={
        /* Pinned action row — PocketPal's Sheet.Actions (ModelSettingsSheet.tsx
           in the reference). One row, right-aligned: the text-weight Reset
           and Cancel share the left, the contained Save Changes takes the
           right. */
        <View className="flex-row items-center justify-between gap-2.5">
          <View className="flex-row items-center gap-2.5">
            {!isRemote ? (
              <Pressable
                onPress={handleReset}
                className="min-h-12 justify-center"
                accessibilityRole="button"
                accessibilityLabel="Reset model settings"
              >
                <Text className="text-center font-sans text-body-lg text-secondary-text">
                  Reset
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={onClose}
              className="min-h-12 justify-center"
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text className="text-center font-sans text-body-lg text-primary">
                Cancel
              </Text>
            </Pressable>
          </View>
          {!isRemote ? (
            <Pressable
              onPress={handleSave}
              className="btn btn--primary"
              accessibilityRole="button"
              accessibilityLabel="Save Changes"
            >
              <Text className="font-sans-semibold text-body-lg text-on-primary">
                Save Changes
              </Text>
            </Pressable>
          ) : null}
        </View>
      }
    >
      {/* Local models only (PocketPal's !isRemote guards). A remote
          endpoint has no GGUF to name, prompt or template — only its
          reasoning posture is ours to configure. */}
      {!isRemote ? (
        <>
          {/* Model Name — PocketPal's titleMediumLight label ABOVE the
              field (ModelSettings.tsx:196-206). */}
          <View className="pb-2">
            <Text className="pb-2 font-sans text-body-lg text-primary-text">
              Model Name
            </Text>
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              className="input"
              placeholderTextColor={colors.secondaryText}
              accessibilityLabel="Model name"
            />
          </View>

          {/* Token settings: a bare label+switch row, a conditional token
              field, then a divider. PocketPal has no "Token settings"
              heading — the dividers are the structure (ModelSettings.tsx:110-160). */}
          <View className="py-2">
            <Divider />
            <ToggleRow
              label="BOS"
              on={addBosToken}
              onPress={() => setAddBosToken((v) => !v)}
            />
            {addBosToken ? (
              <TextInput
                value={bosToken}
                onChangeText={setBosToken}
                placeholder="BOS Token"
                className="input mb-2"
                placeholderTextColor={colors.secondaryText}
                autoCapitalize="none"
                accessibilityLabel="BOS token"
              />
            ) : null}
            <Divider />
            <ToggleRow
              label="EOS"
              on={addEosToken}
              onPress={() => setAddEosToken((v) => !v)}
            />
            {addEosToken ? (
              <TextInput
                value={eosToken}
                onChangeText={setEosToken}
                placeholder="EOS Token"
                className="input mb-2"
                placeholderTextColor={colors.secondaryText}
                autoCapitalize="none"
                accessibilityLabel="EOS token"
              />
            ) : null}
            <Divider />
            <ToggleRow
              label="Add Generation Prompt"
              // Absent = never overridden = llama.cpp's own default (true).
              on={addGenerationPrompt ?? true}
              onPress={() => setAddGenerationPrompt(!(addGenerationPrompt ?? true))}
            />
            <Divider />
          </View>

          <View className="py-2">
            <Field label="System Prompt">
              <TextInput
                value={systemPrompt}
                onChangeText={setSystemPrompt}
                placeholder="Personality and instructions for this model"
                className="input min-h-15"
                placeholderTextColor={colors.secondaryText}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                accessibilityLabel="System prompt"
              />
            </Field>
          </View>

          {/* Template row: a faded preview with an Edit affordance that
              opens the base-template dialog (PocketPal's MaskedView +
              Edit button, ModelSettings.tsx:124-147). Label and preview
              share one line, Edit sits at the end. */}
          <Divider />
          <View className="mt-3 flex-row items-center gap-3">
            <Text className="font-sans text-body-lg text-primary-text">
              Template:
            </Text>
            <TemplatePreview text={templatePreview} />
            <Pressable
              onPress={() => setTemplateDialogOpen(true)}
              className="min-h-12 justify-center px-2"
              accessibilityRole="button"
              accessibilityLabel="Edit chat template"
            >
              <Text className="font-sans text-body-lg text-primary">Edit</Text>
            </Pressable>
          </View>
          <Divider />

          {/* STOP WORDS: label, chips with a close affordance, then the
              add field (ModelSettings.tsx:149-190). */}
          <View className="mt-4 mb-6">
            <Text className="mb-2 font-sans text-xs text-secondary-text">
              STOP WORDS
            </Text>
            {stopWords.length > 0 ? (
              <View className="mb-2 flex-row flex-wrap gap-2">
                {stopWords.map((word) => (
                  <View
                    key={word}
                    className="flex-row items-center rounded-sm bg-surface-2 pl-3"
                  >
                    <Text
                      numberOfLines={1}
                      // The field accepts a PASTED list, so one chip can
                      // arrive holding a long phrase. flex-wrap re-flows the
                      // row BETWEEN chips; it cannot break one chip, whose
                      // width is its content — hence the bound here too.
                      className="max-w-[70%] font-sans text-body-sm text-secondary-text"
                    >
                      {word}
                    </Text>
                    <Pressable
                      onPress={() => setStopWords((prev) => prev.filter((w) => w !== word))}
                      className="icon-btn"
                      accessibilityRole="button"
                      accessibilityLabel={`Remove stop word ${word}`}
                    >
                      <X size={14} color={colors.secondaryText} />
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
              className="input"
              placeholderTextColor={colors.secondaryText}
              autoCapitalize="none"
              returnKeyType="done"
              multiline={false}
              accessibilityLabel="Add new stop word"
            />
          </View>

          {spec?.supportsVision === true ? (
            <>
              <Divider />
              <Text className="section-title mb-3 mt-4">Multimodal Settings</Text>
              <ModelMultimodalSection model={spec} />
            </>
          ) : null}
        </>
      ) : null}

      {/* Reasoning — always, including remote models (PocketPal parity). */}
      <View className="mt-4">
        <Divider />
        <Text className="section-title mb-3 mt-4">Reasoning</Text>
        <ToggleRow
          label="Reasoning model"
          on={thinkingOn}
          onPress={() => setThinkingOverride(modelId, !thinkingOn)}
        />
        <Text className="mb-3 mt-1 font-sans text-body-md text-secondary-text">
          Show the thinking control for this model, even if it wasn&apos;t
          auto-detected.
        </Text>
        {thinkingOn ? (
          <>
            <ToggleRow
              label="Supports graded effort"
              on={effortArmed}
              onPress={() =>
                setEffortOverride(
                  modelId,
                  effortArmed ? null : DEFAULT_EFFORT_LEVEL,
                )
              }
            />
            {effortArmed ? (
              <View className="mt-1">
                <Text className="mb-2 font-sans text-body-md text-secondary-text">
                  Effort levels this model supports
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {EFFORT_LEVELS.map((level) => {
                    const selected = effortLevel === level;
                    return (
                      <Pressable
                        key={level}
                        onPress={() => setEffortOverride(modelId, level)}
                        className={`min-h-12 flex-row items-center gap-1 rounded-sm border px-3 ${
                          selected ? "border-border bg-surface-3" : "border-border bg-surface-1"
                        }`}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        accessibilityLabel={`Effort ${EFFORT_LABELS[level]}`}
                      >
                        {selected ? (
                          <Check size={14} color={colors.primary} />
                        ) : null}
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
              </View>
            ) : null}
          </>
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
