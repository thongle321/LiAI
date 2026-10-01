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
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import BottomSheet, { BottomSheetScrollView } from "@expo/ui/community/bottom-sheet";

import {
  DEFAULT_SAMPLER,
  resolveSampler,
  type SamplerParams,
} from "../../lib/inference/sampler.ts";
import { useInference } from "../../store/inference.ts";
import { useChatStore, defaultGetStore } from "../../store/chat";
import { SamplerRows } from "../SamplerRows.tsx";
import { sheetMaxHeight } from "../../lib/sheet.ts";
import { colors } from "../../themes/tokens.ts";
import { ActionRow, SettingsSection, Segmented } from "../SettingsRows.tsx";

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
  // Read outside the sheet: the sheet is its own native window.
  const insets = useSafeAreaInsets();
  const { height: winHeight } = useWindowDimensions();
  const title = isSession
    ? "Chat Generation Settings (Session)"
    : "Chat Generation Settings (Preset)";

  return (
    // @expo/ui's COMMUNITY sheet, not the universal one. The universal sheet
    // put children straight into a Compose Dialog with no RN RootView, so an
    // RN ScrollView there crashed on touch (RootViewUtil.getRootView). This
    // one hosts children in an RNHostView whose TouchDispatchingRootViewGroup
    // implements RootView + NestedScrollingChild3, so RN scroll views work.
    //
    // No snapPoints on purpose: that is what makes it fitToContents, so the
    // sheet wraps the child's capped height instead of going fillMaxSize and
    // covering the status bar. Capping the child is what puts the top edge at
    // insets.top + 16.
    <BottomSheet
      index={visible ? 0 : -1}
      onChange={(i) => {
        if (i === -1) onClose();
      }}
      onClose={onClose}
      enablePanDownToClose
      backgroundStyle={{ backgroundColor: colors.surface1 }}
    >
      <View
        // A DEFINITE height, not maxHeight. This view is the sheet's only
        // lever on its own height (the community BottomSheet has no
        // maxHeight / maxDynamicContentSize / topInset, and never forwards
        // `modifiers`), and the native side sizes the surface from the
        // child's measured size via RNHostView's requiredSize(childSize).
        // maxHeight is an at-most box, so that measurement starts at zero and
        // the surface falls back to the full dialog. A definite height closes
        // the loop on the first pass, which is what puts the top edge at
        // insets.top + 16. This is the same arithmetic PocketPal gets from
        // gorhom's maxDynamicContentSize.
        style={{ height: sheetMaxHeight(winHeight, insets.top) }}
        className="rounded-t-xl"
      >
        <View className="flex-row items-center justify-between px-4 pb-2 pt-4">
          <Text className="flex-1 mr-2 font-sans-semibold text-h3 text-primary-text">
            {title}
          </Text>
          <Pressable
            onPress={onClose}
            className="h-12 w-12 items-center justify-center"
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel="Close generation settings"
          >
            <X size={20} color={colors.secondaryText} />
          </Pressable>
        </View>

        <BottomSheetScrollView
          // flex-1 is safe here and grow is not: the parent now has a
          // definite height, so flexBasis 0 has a box to resolve against.
          className="flex-1"
          contentContainerClassName="px-4 pb-4"
          keyboardShouldPersistTaps="handled"
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
        </BottomSheetScrollView>

        {!isSession || overrideCount > 0 ? (
          <View className="px-4 pt-2" style={{ paddingBottom: 10 + insets.bottom }}>
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
          </View>
        ) : null}
      </View>
    </BottomSheet>
  );
}
