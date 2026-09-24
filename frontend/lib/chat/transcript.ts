/** Chat export: Markdown transcript for the clipboard (user-approved).
 *
 * Text-only by design — tool chips, images and token counts are live UI,
 * not archive content. Empty texts (streaming stubs) are skipped so a
 * mid-stream export stays clean.
 */

import type { ChatMessage } from "../../types/chat.ts";

/** `# Title` + per-turn role headers; untitled when no title is given. */
export function buildTranscript(
  messages: ChatMessage[],
  title: string | undefined,
): string {
  const lines = [`# ${title ?? "Chat export"}`, ""];
  for (const m of messages) {
    if (m.text.trim() === "") continue;
    lines.push(m.role === "user" ? "**You:**" : "**LiAI:**", "", m.text, "");
  }
  return lines.join("\n");
}
