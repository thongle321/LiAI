/** Generation settings sheet, opened from a control in the chat screen's
 * header.
 *
 * Two levels, mirroring PocketPal's split. The PRESET is the global default
 * every conversation starts from; a SESSION overrides it field by field,
 * so one conversation can be tuned without moving the others. Precedence is
 * session value, then preset — which is what defaultSampler() resolves.
 *
 * Sampling is per conversation here and nowhere else: there is no sampler
 * card in Settings, and a model settings sheet holds no sampler.
 */

import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import {
  DEFAULT_SAMPLER,
  resolveSampler,
  type SamplerParams,
} from "../../lib/inference/sampler.ts";
import { useInference } from "../../store/inference.ts";
import { useChatStore, defaultGetStore } from "../../store/chat";
import { SamplerRows } from "../SamplerRows.tsx";
import { ActionRow, SettingsSection, Segmented } from "../SettingsRows.tsx";
import { Sheet } from "../Sheet.tsx";

type Mode = "session" | "preset";

export function GenerationSettingsSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const sessionId = useChatStore((s) => s.sessionId);
  const {
    sampler: preset,
    thinkingEnabled,
    setSampler,
    setThinkingEnabled,
    load,
  } = useInference();
  const [mode, setMode] = useState<Mode>("session");
  const [override, setOverride] = useState<Partial<SamplerParams> | null>(null);

  useEffect(() => {
    void load();
  }, []);

  // Load this conversation's override whenever the sheet opens on it.
  useEffect(() => {
    if (!visible || mode !== "session") return;
    let cancelled = false;
    void (async () => {
      const store = await defaultGetStore().catch(() => null);
      const value = store && sessionId
        ? await store.getSessionSampler(sessionId).catch(() => null)
        : null;
      if (!cancelled) setOverride(value);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, mode, sessionId]);

  // A conversation that has not been sent yet has no session row to write
  // an override to, so Session is not offered: a slider that moves and then
  // loses the value is worse than not offering the choice.
  const hasSession = sessionId !== null;
  const availableModes: Mode[] = hasSession ? ["session", "preset"] : ["preset"];
  const isSession = hasSession && mode === "session";
  const resolved = isSession
    ? resolveSampler(preset, override)
    : { ...preset };

  function apply(patch: Partial<SamplerParams>): void {
    if (!isSession) {
      setSampler(patch);
      return;
    }
    const next = { ...(override ?? {}), ...patch };
    setOverride(next);
    void (async () => {
      const store = await defaultGetStore().catch(() => null);
      if (store && sessionId) {
        await store.setSessionSampler(sessionId, next).catch(() => null);
      }
    })();
  }

  function reset(): void {
    if (!isSession) {
      setSampler(DEFAULT_SAMPLER);
      return;
    }
    setOverride(null);
    void (async () => {
      const store = await defaultGetStore().catch(() => null);
      if (store && sessionId) {
        await store.setSessionSampler(sessionId, null).catch(() => null);
      }
    })();
  }

  const overrideCount = override ? Object.keys(override).length : 0;

  return (
    // NOT @expo/ui's native BottomSheet, though it was tried and reverted:
    // an RN ScrollView inside its Compose Dialog crashes the app on touch
    // (NativeGestureUtil -> RootViewUtil.getRootView asserts, because that
    // view has no RN RootView inside a native window). Expo's advice to "wrap
    // it in a ScrollView" means @expo/ui's own native one, which cannot host
    // the RN components these rows are built from. The drag handle and
    // swipe-to-dismiss are the price of a scroll that works.
    <Sheet
      visible={visible}
      onClose={onClose}
      title={
        isSession
          ? "Chat Generation Settings (Session)"
          : "Chat Generation Settings (Preset)"
      }
      // Pinned below the scrolling body, and only when there is something
      // to reset: a button that resets nothing is a dead control.
      footer={
        !isSession || overrideCount > 0 ? (
          <SettingsSection>
            <View className="row">
              <ActionRow
                label="Reset"
                description={
                  isSession
                    ? "Drop this conversation's overrides; it follows the preset again."
                    : "Return every value to its shipped default, for this and every conversation."
                }
                buttonLabel={isSession ? "Reset to Preset" : "Reset to System Defaults"}
                variant="secondary"
                onPress={reset}
              />
            </View>
          </SettingsSection>
        ) : undefined
      }
      testID="generation-settings-sheet"
    >
      <Text className="mb-4 font-sans text-body-md text-secondary-text">
        {isSession
          ? overrideCount === 0
            ? "This conversation follows the preset."
            : `${overrideCount} value${overrideCount === 1 ? "" : "s"} overridden. Everything else follows the preset.`
          : "The default every conversation starts from, unless it overrides it."}
      </Text>

      <SettingsSection>
        <View className="row">
          <Segmented<Mode>
            label="Settings source"
            description={
              hasSession
                ? undefined
                : "Start a conversation to give it its own settings. Until then these are the preset."
            }
            value={isSession ? "session" : "preset"}
            options={availableModes}
            displayFor={(m) => (m === "session" ? "Session" : "Preset")}
            onPick={setMode}
          />
        </View>
      </SettingsSection>

      <SettingsSection>
        <SamplerRows
          sampler={resolved}
          thinkingEnabled={thinkingEnabled}
          showThinking={!isSession}
          onChange={apply}
          onThinkingChange={setThinkingEnabled}
        />
      </SettingsSection>
    </Sheet>
  );
}
