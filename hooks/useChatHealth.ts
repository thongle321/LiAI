import { useEffect } from "react";

import { useChatStore } from "@/store/chat.ts";
import { useModelStore } from "@/store/modelStore";

/** Re-resolve inference readiness whenever the active model changes, so the
 *  chat screen's affordances track model switches made elsewhere. */
export function useChatHealth(): void {
  const checkHealth = useChatStore((s) => s.checkHealth);
  const activeModelId = useModelStore((s) => s.activeModelId);
  useEffect(() => {
    void checkHealth();
  }, [activeModelId, checkHealth]);
}
