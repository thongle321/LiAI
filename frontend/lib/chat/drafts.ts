/** Per-session composer drafts: AsyncStorage keys only.
 *
 * The slice (store/chat/draft.ts) owns read/write; ChatInput edits the
 * store field so drafts survive session switches. Unsent conversations
 * park under a fixed key until their first turn mints a session.
 */

export function draftKey(sessionId: string | null): string {
  return sessionId === null ? "liai_draft_new" : `liai_draft_${sessionId}`;
}
