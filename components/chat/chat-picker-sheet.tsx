/** Chat picker: PocketPal's tabbed companion/model sheet in LiAI's shape.
 *
 * PocketPal puts one chevron in the composer (ChatInput.tsx's pal selector)
 * that opens ChatPalModelPickerSheet, whose two tabs are Pals and Models.
 * LiAI had split the same two choices across two sheets and only the model
 * half was reachable from the composer; this reunites them behind that
 * chevron.
 *
 * Parity decisions, taken from the reference:
 * - The sheet opens on Models every time (PocketPal's `activeTab='models'`),
 *   so the empty thread's "Select Model" card and the composer chevron can
 *   share one component.
 * - The tab row carries a tinted pill on the active tab (reference
 *   `activeTab`/`activeTabText`) instead of bare emphasized text.
 * - Companion rows are the reference's flat divider list: name, a
 *   capability subtitle ("Video"/"Assistant" — no PalsHub, so the split is
 *   just the video flag), and a tinted active row; NO per-row borders or
 *   colour stroke. The reference shows a settings gear beside the active
 *   pal instead of a check; management already lives on the Companions
 *   screen here, so the tint alone marks the active row.
 * - "No companion" is the FIRST row and only exists while one is bound,
 *   matching PocketPal's "No Pal / Disable active pal" row.
 * - Picking a companion runs the same activation path as the Companions
 *   screen (default-model resolution included) and closes the sheet.
 *
 * Models come from pickableModels, the same list the header menu and each
 * message's "Regenerate with…" submenu read, so the surfaces cannot disagree
 * about which models exist or which is active. Management stays on the
 * Models and Companions screens, as PocketPal's picker defers to theirs.
 *
 * Keyboard: built on the shared Sheet (TrueSheet) for avoidance. Like
 * PocketPal's picker it DISMISSES the keyboard on open: it rises from the
 * bottom where the composer lives, and leaving the keyboard up would park
 * the field over the sheet.
 */

import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { KeyboardControllerNative } from "react-native-keyboard-controller";
import { Check, X } from "lucide-react-native";

import { Sheet } from "../sheet.tsx";
import { useColors } from "@/themes/tokens.ts";
import { useActivateCompanion } from "@/hooks/useActivateCompanion.ts";
import { pickableModels } from "@/services/chat/models.ts";
import { useChatStore } from "@/store/chat.ts";
import { ensureCompanionsLoaded, useCompanions } from "@/store/companions.ts";
import { useModelStore } from "@/store/model-store.ts";
import type { Companion } from "@/types/companion.ts";

type Tab = "models" | "companions";

const TABS: { id: Tab; label: string }[] = [
  { id: "companions", label: "Companions" },
  { id: "models", label: "Models" },
];

/** PocketPal's getCapabilityText: the video flag is the only capability its
 *  picker names; everything else reads "Assistant". */
function capabilityText(companion: Companion): string {
  return companion.capabilities?.video ? "Video" : "Assistant";
}

export function ChatPickerSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const colors = useColors();
  const [tab, setTab] = useState<Tab>("models");

  const companions = useCompanions((s) => s.companions);
  const models = useModelStore((s) => s.models);
  const remoteApis = useModelStore((s) => s.remoteApis);
  const activeModelId = useModelStore((s) => s.activeModelId);
  const setActiveModel = useModelStore((s) => s.setActiveModel);
  const setActiveRemoteApi = useModelStore((s) => s.setActiveRemoteApi);

  const sessionId = useChatStore((s) => s.sessionId);
  const sessionCompanionId = useChatStore((s) => s.sessionCompanionId);
  const stagedCompanionId = useChatStore((s) => s.stagedCompanionId);
  const setActiveCompanion = useChatStore((s) => s.setActiveCompanion);
  const activate = useActivateCompanion();

  // The bound companion applies to the open conversation; the staged one to
  // the conversation about to start.
  const effectiveCompanionId =
    sessionId !== null ? sessionCompanionId : stagedCompanionId;

  useEffect(() => {
    if (!visible) return;
    setTab("models");
    KeyboardControllerNative.dismiss(false, true);
    void ensureCompanionsLoaded();
  }, [visible]);

  const options = pickableModels(models, remoteApis, activeModelId);

  function selectModel(id: string, host: string | undefined): void {
    // A local entry has no `host`. Asking `remoteApis.some(...)` instead
    // would be an opposite test on the same list, so the day a local id
    // equalled a remote id the picker would switch as the wrong kind.
    if (host === undefined) setActiveModel(id, "local");
    else setActiveRemoteApi(id);
    onClose();
  }

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View className="flex-row h-[50px] items-center gap-2 border-b border-border px-2 pb-0">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <Pressable
              key={t.id}
              onPress={() => setTab(t.id)}
              testID={`chat-picker-tab-${t.id}`}
              // The active tab's pill (reference activeTab): a tinted
              // ground with the emphasized label; the inactive one is
              // bare, secondary text.
              className={`min-h-9 justify-center rounded-lg px-3 py-1 ${
                active ? "bg-surface-2" : ""
              }`}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Text
                className={`font-sans text-title ${
                  active ? "text-primary-text font-sans-semibold" : "text-secondary-text"
                }`}
              >
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {tab === "companions" ? (
        <View>
          {effectiveCompanionId !== null && (
            <Pressable
              onPress={() => {
                void setActiveCompanion(null);
                onClose();
              }}
              className="flex-row items-center gap-3 border-b border-border px-4 py-4 active:bg-surface-3"
              accessibilityRole="button"
              accessibilityLabel="No companion"
            >
              <X size={18} color={colors.primaryText} />
              <View className="flex-1">
                <Text className="text-body-lg text-primary-text">No companion</Text>
                <Text className="text-body-md text-secondary-text">Disable this companion</Text>
              </View>
            </Pressable>
          )}
          {companions.length === 0 ? (
            <Text className="px-4 py-3 text-quiet">
              No companions yet — create one on the Companions screen.
            </Text>
          ) : (
            companions.map((companion) => {
              const selected = companion.id === effectiveCompanionId;
              return (
                <Pressable
                  key={companion.id}
                  onPress={() => {
                    void activate(companion);
                    onClose();
                  }}
                  className={`border-b border-border px-4 py-4 ${
                    selected ? "bg-surface-3 border-primary" : ""
                  }`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`Use companion ${companion.name}`}
                >
                  <Text className="text-body-lg text-primary-text">
                    {companion.name}
                  </Text>
                  <Text className="text-body-md text-secondary-text">
                    {capabilityText(companion)}
                  </Text>
                </Pressable>
              );
            })
          )}
        </View>
      ) : options.length === 0 ? (
        <Text className="px-1 py-3 text-quiet">
          No models are ready yet — download one on the Models screen.
        </Text>
      ) : (
        <View className="gap-1 pt-1">
          {options.map((m) => (
            <Pressable
              key={m.id}
              onPress={() => selectModel(m.id, m.host)}
              className={`min-h-12 flex-row items-center gap-3 rounded-lg px-4 py-4 ${
                m.active ? "bg-surface-2" : ""
              }`}
              accessibilityRole="button"
              accessibilityState={{ selected: m.active }}
              accessibilityLabel={
                m.host === undefined ? m.name : `${m.name} (${m.host})`
              }
            >
              <View className="flex-1">
                <Text className="text-body">{m.name}</Text>
                {m.host !== undefined && (
                  <Text className="text-quiet">{m.host}</Text>
                )}
              </View>
              {m.active && <Check size={18} color={colors.primary} />}
            </Pressable>
          ))}
        </View>
      )}
    </Sheet>
  );
}
