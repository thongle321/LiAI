/** Warn once when a companion's talents meet a model that cannot call them.
 *
 * PocketPal parity (`pocketpal-ai/src/screens/ChatScreen/ChatScreen.tsx:148`):
 * a companion that declares talents needs a model that can call tools, and
 * a model that cannot is worth saying so — once per model, so the notice
 * never becomes noise.
 *
 * The decision itself is pure and lives in services/chat/tool-compat.ts;
 * this hook supplies the facts and shows the notice on the chat screen's
 * existing warning surface (`chatWarning` + ChatWarningSnackbar).
 *
 * The companion is a parameter because the screen already resolves it:
 * the session's binding when a conversation is open, the staged one when
 * it is about to start. Resolving that a second time here would be a
 * second place for the rule to live.
 */

import { useEffect, useMemo } from "react";

import { useChatStore } from "@/store/chat.ts";
import { useModelStore } from "@/store/model-store.ts";
import {
  TOOL_COMPAT_CODE,
  TOOL_COMPAT_WARNING,
  toolCompatMismatch,
} from "@/services/chat/tool-compat.ts";
import type { Companion } from "@/types/companion.ts";

export function useToolCompatWarning(companion: Companion | undefined): void {
  const activeModelId = useModelStore((s) => s.activeModelId);
  const activeProviderType = useModelStore((s) => s.activeProviderType);
  // The active model's verdict: true = can call tools, false = cannot,
  // undefined = never probed. The spec is the record, so the notice works
  // before the model is even loaded.
  const supportsTools = useModelStore((s) =>
    s.models.find((m) => m.id === s.activeModelId)?.supportsTools,
  );
  const hasWarnedToolCompat = useModelStore((s) => s.hasWarnedToolCompat);
  const markToolCompatWarned = useModelStore((s) => s.markToolCompatWarned);
  const chatWarning = useChatStore((s) => s.chatWarning);
  const setChatWarning = useChatStore((s) => s.setChatWarning);

  // Stable across renders: a fresh array here would re-run the effect on
  // every render of the screen.
  const talentNames = useMemo(
    () => companion?.pact?.talents.map((t) => t.name) ?? [],
    [companion],
  );

  useEffect(() => {
    // Is the notice on screen OURS? Two notices share the slot, and only
    // the owner may take it down.
    const ours = chatWarning?.code === TOOL_COMPAT_CODE;
    // The CONDITION, not the verdict on raising it: the warned-set says
    // whether the user has been told, not whether the pair mismatches. A
    // notice that was raised and recorded would otherwise look "already
    // warned" on the next run and take itself down.
    const mismatch = toolCompatMismatch({
      providerType: activeProviderType,
      talentNames,
      supportsTools,
    });
    if (!mismatch) {
      // The model changed under a notice that is still up: it was about the
      // old model, so it goes. A notice we never raised is not ours to
      // touch.
      if (ours) setChatWarning(null);
      return;
    }
    // Already on screen: setting it again would restart the snackbar's
    // dwell and keep the notice from ever expiring.
    if (ours) return;
    // The user has been told about this model already.
    if (activeModelId === null) return;
    if (hasWarnedToolCompat(activeModelId)) return;
    // `recoverable: false` on purpose: the snackbar shows a Retry button
    // for a recoverable warning, and retrying the last turn is no answer
    // to "this model cannot call tools".
    setChatWarning({
      code: TOOL_COMPAT_CODE,
      // A model notice, not a turn notice: it is about the model, so it
      // stays true in the next conversation.
      scope: "model",
      message: TOOL_COMPAT_WARNING,
      severity: "warning",
      recoverable: false,
    });
    // Recorded AFTER the notice, so a crash between the two costs one
    // repeated notice rather than a silent one.
    markToolCompatWarned(activeModelId);
  }, [
    activeModelId,
    activeProviderType,
    chatWarning,
    talentNames,
    supportsTools,
    hasWarnedToolCompat,
    markToolCompatWarned,
    setChatWarning,
  ]);
}
