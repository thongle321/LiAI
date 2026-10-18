/** The READ half of export: ids → full sessions with turns.
 *
 * Shared by ChatMenu's export panel and the drawer's bulk export so
 * there is exactly one path from store rows to `ExportSession[]` — the
 * issue names services/chat//transcript.ts as the mistake a second path makes.
 * Serialization stays in services/chat//export.ts (pure, tested); this only
 * reads.
 *
 * `ids` omitted = every session. An id whose turns cannot be read is
 * skipped, as ChatMenu always did.
 */

import { defaultGetStore } from "@/store/chat.ts";
import type { ExportSession } from "./export.ts";

export async function readExportSessions(
  ids?: string[],
): Promise<ExportSession[]> {
  const store = await defaultGetStore();
  if (!store) throw new Error("Conversations are not ready yet.");
  const listed = await store.listSessions();
  const wanted = ids ?? listed.map((r) => r.id);
  const sessions: ExportSession[] = [];
  for (const id of wanted) {
    const turns = await store.get(id).catch(() => null);
    if (turns === null) continue;
    const row = listed.find((r) => r.id === id);
    sessions.push({
      id,
      title: row?.title ?? "Untitled",
      pinned: row?.pinned ?? false,
      updatedAt: row?.updatedAt ?? Date.now(),
      turns,
    });
  }
  if (sessions.length === 0) throw new Error("There is nothing to export yet.");
  return sessions;
}
