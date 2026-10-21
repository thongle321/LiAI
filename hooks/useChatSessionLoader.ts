import { useEffect } from "react";

import { useChatStore } from "@/store/chat.ts";

/** Load the active session on mount and check inference health once it is
 *  available. Extracted from the chat route so the mount-time hydration
 *  sequence is testable in isolation. */
export function useChatSessionLoader(): void {
  const loadSession = useChatStore((s) => s.loadSession);
  const checkHealth = useChatStore((s) => s.checkHealth);
  useEffect(() => {
    void loadSession().then(() => checkHealth());
  }, [loadSession, checkHealth]);
}
