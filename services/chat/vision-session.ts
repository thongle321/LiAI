/** The vision tab's ephemeral conversation memory (chat-screen issue set).
 *
 *  A vision-mode Q&A must leave NO chat session behind: the turns do not
 *  mint a session row, the active-session pointer must never move, and the
 *  answer that was just spoken must not appear in the chat history list.
 *
 *  The model still needs the recent questions to answer follow-ups ("what
 *  about now?"), so this module keeps a bounded, in-memory rolling history
 *  that lives only as long as the mode: reset() on exit, and nothing ever
 *  reaches the session store.
 */

import type { ChatMessage } from "@/types/chat.ts";

/** The ephemeral session id a vision turn carries: nothing stores under
 *  it (the runner is store-less), the id only labels the turn. */
export const VISION_EPHEMERAL_ID = "vision-ephemeral";

/** Follow-up context, in turns: six Q&As is the live-camera horizon —
 *  older frames are captured again within seconds and the last few
 *  questions are what "what about now?" refers to. */
const MAX_RECORDS = 6;

let record: ChatMessage[] = [];

/** The history the next vision turn runs with (text bubbles only —
 *  frames are not replayable once gone, and re-sending every recent
 *  frame would cost tokens for no accuracy). */
export function visionHistory(): ChatMessage[] {
  return record;
}

/** Record one answered question. Keeps the last MAX_RECORDS. */
export function visionRecord(question: string, reply: string): void {
  const at = Date.now();
  record = [
    ...record,
    { id: `v${at}-q`, role: "user" as const, text: question, at },
    { id: `v${at}-a`, role: "assistant" as const, text: reply, at },
  ].slice(-MAX_RECORDS * 2);
}

/** Delete the whole conversation — the exit path calls this. */
export function visionReset(): void {
  record = [];
}

/** For tests and dev diagnostics only. */
export function visionRecordCount(): number {
  return record.length;
}
