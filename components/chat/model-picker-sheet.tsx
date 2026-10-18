/** Model picker sheet for the chat thread (PocketPal's
 * ChatPalModelPickerSheet, LiAI shape).
 *
 * Opened from the empty thread's "Select Model" card: activating a model
 * no longer means leaving the conversation. PocketPal's sheet is a tabbed
 * picker over companions AND models — LiAI has no companions, so this is the models
 * half only, and management (download, delete, remote setup) stays on the
 * /models screen, exactly as PocketPal's picker defers to their Models
 * screen for the same things.
 *
 * The list is services/chat//models.ts's pickableModels — the same one the
 * header menu and each message's "Regenerate with…" submenu read, so the
 * three surfaces can never disagree about which models exist or which is
 * active.
 *
 * Keyboard: built on the shared Sheet (TrueSheet), which owns keyboard
 * avoidance natively. The one rule ported from PocketPal's picker is that
 * it DISMISSES the keyboard on open — it is opened from the bottom of the
 * screen where the composer lives, and a sheet presenting over a live
 * keyboard leaves the composer parked on top of it. PocketPal also closes
 * their sheet on keyboardDidShow; with the dismiss-on-open that sequence
 * cannot occur, so it is not reproduced. (Dismiss runs through
 * KeyboardControllerNative — 1.21.9 exports no `Keyboard` class.)
 */

import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import { KeyboardControllerNative } from "react-native-keyboard-controller";
import { Check } from "lucide-react-native";

import { Sheet } from "../sheet.tsx";
import { colors } from "@/themes/tokens.ts";
import { pickableModels } from "@/services/chat/models.ts";
import { useModelStore } from "@/store/modelStore";

export function ModelPickerSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const models = useModelStore((s) => s.models);
  const remoteApis = useModelStore((s) => s.remoteApis);
  const activeModelId = useModelStore((s) => s.activeModelId);
  const setActiveModel = useModelStore((s) => s.setActiveModel);
  const setActiveRemoteApi = useModelStore((s) => s.setActiveRemoteApi);

  useEffect(() => {
    if (visible) KeyboardControllerNative.dismiss(false, true);
  }, [visible]);

  const options = pickableModels(models, remoteApis, activeModelId);

  function select(id: string, host: string | undefined): void {
    // Same discriminator as the header menu and "Regenerate with…": a
    // local entry has no `host`. Asking `remoteApis.some(...)` instead
    // would be an opposite test on the same list, so the day a local id
    // equalled a remote id the picker would switch as the wrong kind.
    if (host === undefined) setActiveModel(id, "local");
    else setActiveRemoteApi(id);
    onClose();
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Select Model">
      {options.length === 0 ? (
        <Text className="px-1 py-3 text-quiet">
          No models are ready yet — download one on the Models screen.
        </Text>
      ) : (
        <View className="gap-1 pt-1">
          {options.map((m) => (
            <Pressable
              key={m.id}
              onPress={() => select(m.id, m.host)}
              className="min-h-12 flex-row items-center gap-3 rounded-lg px-2 py-2"
              accessibilityRole="button"
              accessibilityState={{ selected: m.active }}
              accessibilityLabel={
                m.host === undefined ? m.name : `${m.name} (${m.host})`
              }
            >
              <View className="flex-1">
                <Text className="font-sans text-body-md text-primary-text">
                  {m.name}
                </Text>
                {m.host !== undefined && (
                  <Text className="text-quiet">
                    {m.host}
                  </Text>
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
