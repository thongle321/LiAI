/** Connection-dot class shared by the chat header and the drawer. */

import type { Connection } from "../store/chat.ts";

export const CONNECTION_DOT_CLASS: Record<Connection, string> = {
  unknown: "status-dot status-dot--offline",
  up: "status-dot status-dot--online",
  down: "status-dot status-dot--error",
};
