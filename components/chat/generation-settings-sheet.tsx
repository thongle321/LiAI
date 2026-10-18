/** Generation settings sheet, opened from a control in the chat screen's
 * header — PocketPal's ChatGenerationSettingsSheet shape (grilling Q1-Q6).
 *
 * Two levels, mirroring PocketPal's split. The PRESET is the global default
 * every conversation starts from; a SESSION overrides it field by field,
 * so one conversation can be tuned without moving the others. Precedence is
 * session value, then preset — which is what defaultSampler() resolves.
 *
 * Interaction parity (Q4): edits BUFFER in a local draft; the actions row
 * mirrors PocketPal's footer (Reset on the left — a dropdown of both
 * destinations for sessions — Save as preset for sessions, Save), and like
 * the reference's Sheet.Actions it is PINNED below the scroller.
 * X / swipe / scrim all land on onClose, which discards the draft by never
 * committing it.
 *
 * Validation (Q6=C): Save re-checks the two typed fields (custom N PREDICT,
 * SEED — the ones whose live checks are min-only) and fires BOTH layers:
 * a summary Alert with the offending bullets AND an inline red mark on the
 * field (TextFieldRow's external `error`).
 *
 * Q7=B, recorded: INCLUDE THINKING IN CONTEXT is BUILT — this app now
 * captures `reasoning_content` (reasoning_format auto), persists it per
 * assistant turn, renders a reasoning block, and the switch gates whether
 * it travels back to the model. The enable-thinking control has no row
 * here (PocketPal keeps it as a chat-input pill); `thinkingEnabled` still
 * threads through untouched. JINJA (Q5b) remains a per-turn llama.rn
 * flag, threaded store → turn → engine.
 */

import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

import {
  DEFAULT_SAMPLER,
  resolveSampler,
  type SamplerParams,
} from "@/services/inference/sampler.ts";
import type { SessionOverride } from "@/services/chat/session-store.ts";
import { useShallow } from "zustand/shallow";
import { useInference } from "@/store/inference.ts";
import { useModelStore } from "@/store/modelStore.ts";
import { useChatStore, defaultGetStore } from "@/store/chat";
import { useCompanions } from "@/store/companions.ts";
import { SamplerRows } from "./sampler-rows.tsx";
import { Sheet } from "../sheet.tsx";
import { ResetMenu } from "../reset-menu.tsx";
import { RowSizeProvider, Segmented, SettingsSection } from "../settings-rows.tsx";

type Mode = "companion" | "session" | "preset";

/** Save-time bounds for the typed fields: their live checks cover the floor
 *  only (n-predict) or nothing at all (seed), so over-max values can reach
 *  the draft. The slider fields clamp by construction. */
function validateTyped(sampler: SamplerParams): Partial<Record<"seed" | "nPredict", string>> {
  const errors: Partial<Record<"seed" | "nPredict", string>> = {};
  if (sampler.nPredict !== -1 && (sampler.nPredict < 1 || sampler.nPredict > 8192)) {
    errors.nPredict = "Custom length must be between 1 and 8192 tokens.";
  }
  if (sampler.seed !== -1 && (sampler.seed < 0 || !Number.isSafeInteger(sampler.seed))) {
    errors.seed = "Seed must be -1 (random) or a whole number 0 and up.";
  }
  return errors;
}

interface Draft {
  sampler: SamplerParams;
  jinja: boolean;
}

export function GenerationSettingsSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const sessionId = useChatStore((s) => s.sessionId);
  const sessionCompanionId = useChatStore((s) => s.sessionCompanionId);
  const setSettingsSource = useChatStore((s) => s.setSessionSettingsSource);
  const companion = useCompanions((s) =>
    sessionCompanionId === null ? undefined : s.companions.find((p) => p.id === sessionCompanionId),
  );
  // PocketPal: with an active companion the source toggle shows (companion ⇄ custom);
  // without one the sheet keeps LiAI's session/preset split.
  const hasCompanion = companion !== undefined;
  // One useShallow unit: all five fields feed the draft, so the sheet
  // re-renders only when one of them changes.
  const {
    sampler: preset,
    jinjaEnabled,
    setSampler,
    setJinjaEnabled,
    load,
  } = useInference(
    useShallow((s) => ({
      sampler: s.sampler,
      jinjaEnabled: s.jinjaEnabled,
      setSampler: s.setSampler,
      setJinjaEnabled: s.setJinjaEnabled,
      load: s.load,
    })),
  );
  const [mode, setMode] = useState<Mode>("session");
  const [override, setOverride] = useState<Partial<SamplerParams> | null>(null);
  // The WHOLE override as loaded (sampler + thinking + effort): Save
  // writes back through it so the fields this sheet does not edit stay.
  // A ref, not state: a re-render must not reset it before Save reads it.
  const loadedOverride = useRef<SessionOverride | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Partial<Record<"seed" | "nPredict", string>>>({});

  // 06b: for a remote model every knob here is decoration — remote
  // turns NULL the sampler (store/chat/index.ts) — so the honest line
  // is what actually applies: the server's own defaults, read from the
  // C7 /props probe. Keys are provider ids (caps are keyed per
  // provider, the remote- prefix stripped like chat.tsx does).
  const activeProviderType = useModelStore((s) => s.activeProviderType);
  const activeModelId = useModelStore((s) => s.activeModelId);
  const remoteCaps = useModelStore((s) => s.remoteCaps);
  const isRemote = activeProviderType === "remote";
  const providerId =
    activeModelId !== null && activeModelId.startsWith("remote-")
      ? activeModelId.slice("remote-".length)
      : null;
  const serverDefaults =
    providerId !== null ? remoteCaps[providerId]?.samplerDefaults : undefined;
  const examples =
    serverDefaults === undefined
      ? ""
      : ["temperature", "top_p", "top_k"]
          .filter((name) => serverDefaults[name] !== undefined)
          .map((name) => `${name} ${serverDefaults[name]}`)
          .join(" · ");
  const serverDefaultsNote = !isRemote
    ? null
    : `Remote server: its own defaults${examples === "" ? "" : ` (${examples})`} — the knobs below apply to local models only.`;

  useEffect(() => {
    void load();
  }, []);

  // Load this conversation's override whenever the sheet opens on it.
  // The override carries sampler + thinking + effort; this sheet edits
  // the SAMPLER layer, so it reads `.sampler` and commits back through
  // the whole override (Save must not erase thinking/effort it does not
  // show). Skipped in 'companion' mode: the companion's settings have no session
  // override to read.
  useEffect(() => {
    if (!visible || mode !== "session") return;
    let cancelled = false;
    void (async () => {
      const store = await defaultGetStore().catch(() => null);
      const value = store && sessionId
        ? await store.getSessionOverride(sessionId).catch(() => null)
        : null;
      if (!cancelled) setOverride(value?.sampler ?? null);
      loadedOverride.current = value;
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, mode, sessionId]);

  // The sheet opens on the source the conversation actually has: 'companion'
  // when a persona is bound (PocketPal's default), else 'session'.
  useEffect(() => {
    if (!visible) return;
    setMode(hasCompanion ? "companion" : "session");
  }, [visible, hasCompanion]);

  // A conversation that has not been sent yet has no session row to write
  // an override to, so Session is not offered: a slider that moves and then
  // loses the value is worse than not offering the choice.
  const hasSession = sessionId !== null;
  const availableModes: Mode[] = hasSession
    ? hasCompanion
      ? ["companion", "session", "preset"]
      : ["session", "preset"]
    : ["preset"];
  const isSession = hasSession && mode === "session";
  const isCompanion = hasSession && hasCompanion && mode === "companion";
  const title = isCompanion
    ? `Chat Generation Settings (Companion: ${companion.name})`
    : isSession
      ? "Chat Generation Settings (Session)"
      : "Chat Generation Settings (Preset)";

  // Buffer a fresh draft whenever the sheet opens or the source switches
  // (PocketPal reloads settings on source change too — edits on the old
  // source are abandoned, not merged). 'companion' mode buffers the RESOLVED
  // companion settings (its partial completionSettings over the preset) —
  // shown inert, never committed.
  useEffect(() => {
    if (!visible) return;
    setErrors({});
    setDraft({
      sampler: isSession
        ? resolveSampler(preset, override)
        : isCompanion
          ? resolveSampler(preset, companion?.completionSettings ?? null)
          : { ...preset },
      jinja: jinjaEnabled,
    });
  }, [visible, mode, isSession, isCompanion, preset, override, jinjaEnabled, companion]);

  /** Validate, commit the draft to the stores, close-worthy. False = the
   *  validation alert is showing and the sheet stays open. */
  function commitDraft(): boolean {
    if (!draft) return false;
    const current = draft;
    const errs = validateTyped(current.sampler);
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      Alert.alert(
        "Invalid values",
        "Please correct:\n" +
          Object.entries(errs)
            .map(([key, msg]) => `• ${key}: ${msg}`)
            .join("\n"),
        [{ text: "OK" }],
      );
      return false;
    }
    if (isSession) {
      void (async () => {
        const store = await defaultGetStore().catch(() => null);
        if (store && sessionId) {
          await store
            .setSessionOverride(sessionId, {
              ...loadedOverride.current,
              sampler: current.sampler,
            })
            .catch(() => null);
        }
      })();
    } else {
      setSampler(current.sampler);
    }
    // JINJA is a global and commits in either mode. The include-thinking
    // flag needs no work here: it lives INSIDE the sampler object the
    // branches above commit, so it follows the session/preset routing.
    setJinjaEnabled(current.jinja);
    return true;
  }

  function handleSave(): void {
    if (commitDraft()) onClose();
  }

  function handleSaveAsPreset(): void {
    if (!commitDraft()) return;
    // PocketPal order: save the session, apply the same values to the
    // preset, then confirm.
    if (draft) setSampler(draft.sampler);
    onClose();
    Alert.alert(
      "Saved as preset",
      "These settings now start every new conversation.",
      [{ text: "OK" }],
    );
  }

  /** Draft-only edits: nothing here may reach a store before Save. */
  function apply(patch: Partial<SamplerParams>): void {
    setDraft((d) => (d ? { ...d, sampler: { ...d.sampler, ...patch } } : d));
    // A field the user just corrected stops being marked: the Save-time
    // error lives on until its own field changes.
    setErrors((e) => {
      if (!("nPredict" in patch) && !("seed" in patch)) return e;
      const next = { ...e };
      if ("nPredict" in patch) delete next.nPredict;
      if ("seed" in patch) delete next.seed;
      return next;
    });
  }

  function setDraftJinja(on: boolean): void {
    setDraft((d) => (d ? { ...d, jinja: on } : d));
  }

  // Resets touch the DRAFT only — PocketPal's reset buttons edit the form,
  // Save commits it.
  function resetToPreset(): void {
    setDraft((d) => (d ? { ...d, sampler: { ...preset } } : d));
  }

  function resetToDefault(): void {
    setDraft((d) => (d ? { ...d, sampler: { ...DEFAULT_SAMPLER } } : d));
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      actions={
        /* Pinned action row (PocketPal's Sheet.Actions) — see Sheet.tsx.
           'companion' mode owns no settings to save or reset: the row shows
           only the close affordance via the sheet's own X. */
        isCompanion ? (
          <View />
        ) : (
        <View className="flex-row items-center justify-between">
          {isSession ? (
            <ResetMenu
              items={[
                { label: "Reset to preset", onPress: resetToPreset },
                { label: "Reset to System Defaults", onPress: resetToDefault },
              ]}
            />
          ) : (
            <Pressable
              onPress={resetToDefault}
              className="min-h-12 justify-center"
              accessibilityRole="button"
              accessibilityLabel="Reset to System Defaults"
            >
              <Text className="text-body">
                Reset to System Defaults
              </Text>
            </Pressable>
          )}
          <View className="flex-row items-center gap-2">
            {isSession ? (
              <Pressable
                onPress={handleSaveAsPreset}
                className="btn btn--secondary active:opacity-80"
                accessibilityRole="button"
                accessibilityLabel="Save as preset"
              >
                <Text className="text-body">Save as preset</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={handleSave}
              className="btn btn--primary active:opacity-80"
              accessibilityRole="button"
              accessibilityLabel="Save"
            >
              <Text className="text-action">Save</Text>
            </Pressable>
          </View>
        </View>
        )
      }
    >
      {/* PocketPal: the source control sits ABOVE the card, not inside it
          (styles.settingsSourceContainer: horizontal margin, 16 below). */}
      <View className="px-3 mb-4">
        {/* Their settingsSource label is labelMedium 12 — one rung above
            the card's 11, so this zone pins it separately. */}
        <RowSizeProvider label="text-body-sm" desc="text-body-sm">
          <Segmented<Mode>
            label="Settings source"
            description={
              hasSession
                ? isCompanion
                  ? `${companion.name}'s generation settings apply. Choose Session to tune this conversation on its own.`
                  : undefined
                : "Start a conversation to give it its own settings. Until then these are the preset."
            }
            value={mode}
            options={availableModes}
            displayFor={(m) =>
              m === "companion"
                ? `Companion (${companion?.name ?? "persona"})`
                : m === "session"
                  ? "Session"
                  : "Preset"
            }
            onPick={(m) => {
              setMode(m);
              // PocketPal parity: the toggle writes the source
              // IMMEDIATELY, not on Save — 'custom' takes effect the
              // moment the user asks for it, and back to 'companion' makes
              // the session follow the persona again (its stored
              // override stays, inert, for the next flip).
              if (hasSession && (m === "companion" || m === "session")) {
                void setSettingsSource(m === "companion" ? "companion" : "custom");
              }
            }}
          />
        </RowSizeProvider>
      </View>
      {serverDefaultsNote !== null ? (
        <Text className="px-1 pb-2 text-quiet">
          {serverDefaultsNote}
        </Text>
      ) : null}
      {/* One divider-less card, 24px rhythm — CompletionSettings' shape.
          In 'companion' mode the rows are INERT (no pointer events, dimmed):
          the values shown are the companion's, and a slider that moved and
          snapped back would be a lie. */}
      <SettingsSection plain>
        {draft ? (
          <View pointerEvents={isCompanion ? "none" : "auto"} className={isCompanion ? "opacity-40" : undefined}>
            <SamplerRows
              sampler={draft.sampler}
              jinjaEnabled={draft.jinja}
              errors={errors}
              onChange={apply}
              onJinjaChange={setDraftJinja}
            />
          </View>
        ) : null}
      </SettingsSection>
    </Sheet>
  );
}
