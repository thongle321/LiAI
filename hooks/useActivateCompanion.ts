/** Activate a companion for chat (PocketPal's activatePalWithModel).
 *
 *  One orchestrator for BOTH surfaces (Companions screen, in-chat picker), so
 *  the bind → model → navigate order cannot drift between them: bind the
 *  companion first (staged for an unsent conversation, bound in place
 *  otherwise), then resolve its recommended model through the pure
 *  rules in services/companions//activate.ts — select when nothing is active,
 *  ask before leaving a different model — then land on Chat.
 */

import { Alert } from "react-native";
import { router } from "expo-router";

import { useChatStore } from "@/store/chat.ts";
import { useModelStore } from "@/store/model-store.ts";
import { resolveCompanionModelAction } from "@/services/companions/activate.ts";
import type { Companion } from "@/types/companion.ts";

export function useActivateCompanion(): (companion: Companion) => Promise<void> {
  const setActiveCompanion = useChatStore((s) => s.setActiveCompanion);

  return async (companion: Companion) => {
    // Bind FIRST: the model prompt below is a question about this companion,
    // and answering it must not race the bind.
    await setActiveCompanion(companion.id);
    const m = useModelStore.getState();
    const downloaded = m.models.filter((spec) => spec.downloadStatus === "completed");
    const action = resolveCompanionModelAction(companion.defaultModel, downloaded, m.activeModelId);
    if (action.kind === "select") {
      await m.setActiveModel(action.model.id, "local");
    } else if (action.kind === "ask") {
      Alert.alert(
        "Switch Model?",
        `Switch to "${action.model.name}" for this companion?`,
        [
          { text: "Keep Current", style: "cancel" },
          {
            text: "Switch",
            onPress: () => {
              void m.setActiveModel(action.model.id, "local");
            },
          },
        ],
      );
    }
    // A staged pick applies to the conversation about to start; a bound
    // one to the open conversation. Either way the chat IS the point.
    if (useChatStore.getState().sessionId === null) {
      void useChatStore.getState().newConversation();
    }
    router.navigate("/chat");
  };
}
