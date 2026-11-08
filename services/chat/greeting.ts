/** What an empty thread shows for the bound companion (PocketPal's ChatView
 *  greeting predicates).
 *
 *  The bubble and the chips are INDEPENDENT in the reference: the bubble
 *  needs `greeting.text`, the chips need `greeting.suggestedPrompts`. Gating
 *  both on the text (the old behaviour) loses a prompts-only greeting.
 *
 *  Pure: the chat screen owns the empty-thread predicate, this owns what a
 *  non-empty result means.
 */

import type { Companion } from "@/types/companion.ts";

export interface GreetingView {
  /** Non-blank greeting text, or null when there is none. */
  text: string | null;
  /** Non-blank suggested prompts, possibly empty. */
  prompts: string[];
}

export function resolveGreeting(
  companion: Pick<Companion, "greeting"> | undefined,
  emptyThread: boolean,
): GreetingView | undefined {
  if (!emptyThread) return undefined;
  const greeting = companion?.greeting;
  if (greeting === undefined) return undefined;
  const text = greeting.text.trim() === "" ? null : greeting.text;
  const prompts = (greeting.suggestedPrompts ?? []).filter(
    (prompt) => prompt.trim() !== "",
  );
  return text === null && prompts.length === 0 ? undefined : { text, prompts };
}
