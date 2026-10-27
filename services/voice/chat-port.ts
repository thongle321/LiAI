/** The chat the voice mode talks to, backed by LiAI's chat store.
 *
 *  Maps the ported cascade engine's `VoiceTurnPort` onto
 *  `useChatStore.send` — the normal send path, so spoken turns share
 *  history, session persistence and tools with typed chat. LiAI ext of
 *  the ported contract (reference: pocketpal-ai VoiceTurnPort): the reply
 *  text rides TWO captions — `lastReply` read after the turn settles, and
 *  `onReply` called while the run settles so the caption can land while
 *  the reply is still speaking. The engine resolves PocketPal's per-turn
 *  `speech_failed` as "no playback was observed during the turn".
 *  The engine contract itself is unchanged.
 *
 *  One failure rule, mapped to the engine's `reply_failed`: a refused
 *  send (empty text, chat busy), a missing assistant row, an errored row,
 *  and a blank successful reply all REJECT.
 */

import { speakReply } from "@/services/voice/voice-speak.ts";
import { useChatStore } from "@/store/chat.ts";
import type { ChatMessage } from "@/types/chat.ts";

import type { VoiceTurnPort } from "./types.ts";
import { whenPlaybackIdle } from "./playback-wait.ts";

/** What the port needs from its backing. Injectable so suites run very
 *  light; production passes the real chat store. */
export interface VoiceChatHand {
  send: (text: string) => Promise<boolean>;
  stop: () => void;
  /** Resolves once a running chat turn has settled — the spoken send then
   *  runs on a free line (the store's send refuses while busy). */
  waitIdle: () => Promise<void>;
  messages: () => ChatMessage[];
  speak: (text: string) => void;
}

export interface VoiceChatPort extends VoiceTurnPort {
  /** The last settled turn's reply text, null after a refused send. */
  readonly lastReply: string | null;
  /** Fires once per settled turn, right before the speech starts. */
  onReply: ((text: string) => void) | null;
}

export function createChatTurnPort(hand: VoiceChatHand): VoiceChatPort {
  let lastReply: string | null = null;
  let onReply: ((text: string) => void) | null = null;
  return {
    get lastReply() {
      return lastReply;
    },

    set onReply(fn: ((text: string) => void) | null) {
      onReply = fn;
    },

    get onReply(): ((text: string) => void) | null {
      return onReply;
    },

    send: async (text, onTurnCreated) => {
      lastReply = null;
      await hand.waitIdle();
      const before = hand.messages().length;
      if (!(await hand.send(text))) {
        throw new Error("send refused");
      }
      const row = hand
        .messages()
        .slice(before)
        .find((m) => m.role === "assistant");
      if (!row) throw new Error("no assistant row");
      onTurnCreated(row.id);
      // `error` beats text: a blank row WITH an error is a failed turn.
      if (row.error !== undefined) throw new Error("turn errored");
      if (row.text.trim() === "") throw new Error("empty reply");
      lastReply = row.text;
      hand.speak(row.text);
      onReply?.(row.text);
      await whenPlaybackIdle();
    },

    stop: () => hand.stop(),
  };
}

/** A chat turn may still be running (a typed send beat us to the model);
 *  give it up to thirty seconds, so a slow model doesn't get reported as
 *  "send refused". */
async function waitForChatIdle(): Promise<void> {
  const waited = 100;
  for (let i = 0; i < 300; i++) {
    if (!useChatStore.getState().sending) return;
    await new Promise((resolve) => setTimeout(resolve, waited));
  }
}

/** The real binding: LiAI's chat store + TTS through the shared play path. */
export const chatVoicePort: VoiceChatPort = createChatTurnPort({
  send: (text) => useChatStore.getState().send(text, undefined, { voiceMode: true }),
  stop: () => useChatStore.getState().stop(),
  waitIdle: () => waitForChatIdle(),
  messages: () => useChatStore.getState().messages,
  speak: (text) => speakReply(text),
});
