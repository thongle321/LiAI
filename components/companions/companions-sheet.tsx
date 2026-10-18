/** In-chat companion picker (PocketPal's ChatPalModelPickerSheet, pals tab).
 *
 *  LiAI's header already has a models picker sheet for the no-model
 *  path; this is the persona half: pick a companion for THIS conversation
 *  (or the next one), with the active companion checked and a "No companion" row
 *  to unbind. Model switching stays with the model picker — the two
 *  concerns have separate sheets here rather than one two-tab sheet.
 */

import { Pressable, Text, View } from "react-native";
import { Check } from "lucide-react-native";

import { colors } from "@/themes/tokens.ts";
import { Sheet } from "@/components/sheet.tsx";
import { useActivateCompanion } from "@/hooks/useActivateCompanion.ts";
import { useChatStore } from "@/store/chat.ts";
import { useCompanions, ensureCompanionsLoaded } from "@/store/companions.ts";
import { useEffect } from "react";

export function CompanionsSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const companions = useCompanions((s) => s.companions);
  const sessionId = useChatStore((s) => s.sessionId);
  const sessionCompanionId = useChatStore((s) => s.sessionCompanionId);
  const stagedCompanionId = useChatStore((s) => s.stagedCompanionId);
  const setActiveCompanion = useChatStore((s) => s.setActiveCompanion);
  const activate = useActivateCompanion();
  // The bound companion applies to the open conversation; the staged one to
  // the conversation about to start.
  const effectiveId = sessionId !== null ? sessionCompanionId : stagedCompanionId;

  useEffect(() => {
    if (visible) void ensureCompanionsLoaded();
  }, [visible]);

  return (
    <Sheet visible={visible} onClose={onClose} title="Companions">
      <View className="gap-2 pb-2">
        {companions.map((companion) => {
          const selected = companion.id === effectiveId;
          return (
            <Pressable
              key={companion.id}
              onPress={() => {
                void activate(companion);
                onClose();
              }}
              className="min-h-12 flex-row items-center gap-3 rounded-lg border border-border bg-surface-1 px-3 active:bg-surface-3"
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Use companion ${companion.name}`}
            >
              <View className="h-6 w-1.5 overflow-hidden rounded">
                <View
                  className="h-1/2"
                  style={{ backgroundColor: companion.color?.[0] ?? colors.primary }}
                />
                <View
                  className="h-1/2"
                  style={{ backgroundColor: companion.color?.[1] ?? colors.surface3 }}
                />
              </View>
              <View className="flex-1">
                <Text className="text-body-md text-primary-text">{companion.name}</Text>
                {companion.description ? (
                  <Text numberOfLines={1} className="text-body-sm text-secondary-text">
                    {companion.description}
                  </Text>
                ) : null}
              </View>
              {selected ? (
                <Check size={18} color={colors.primary} />
              ) : null}
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => {
            void setActiveCompanion(null);
            onClose();
          }}
          className="min-h-12 justify-center rounded-lg border border-border bg-surface-1 px-3 active:bg-surface-3"
          accessibilityRole="button"
          accessibilityLabel="No companion"
        >
          <Text className="text-body-md text-secondary-text">No companion</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}
