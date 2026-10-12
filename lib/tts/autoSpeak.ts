/** Auto-speak: pipe a streaming reply into TTS as the model writes it.
 *
 * PocketPal streams token deltas straight into a speech stream so the first
 * sentence plays while the tail is still being generated. This is the same
 * shape, minus their MobX store: a module-level controller the chat turn
 * drives at four points (begin / append / finish / stop).
 *
 * Reply text and reasoning already arrive on separate callbacks (see
 * store/chat/send.ts), so there is no <think> stripping to do here — but
 * PocketPal does acknowledge a reasoning turn out loud, once, before the
 * reply starts. That is the `placeholderEmitted` latch below.
 *
 * Nothing native is imported at module scope: `resolve` and `stopInFlight`
 * are injected, so tests run in plain node against fakes — the same
 * injectable-seams pattern as createTurnRunner / createVoiceStore.
 */

import { useVoice } from "../../store/voice.ts";
import type { Engine, StreamingHandle, Voice } from "./types.ts";

/** Said once when the model reasoned before answering, so the pause is not
 *  mistaken for a stalled stream. PocketPal parity. */
const THINKING_PLACEHOLDERS = [
  "Hmm, let me think.",
  "Hmm.",
  "Let me think.",
  "Okay, let me think about that.",
  "One moment.",
  "Let me consider this.",
];

export interface AutoSpeakDeps {
  /** Whether the user wants replies read aloud. */
  isEnabled: () => boolean;
  /** Engine + voice to speak with. Async because the app impl loads native. */
  resolve: () => Promise<{ engine: Engine; voice: Voice }>;
  /** Serialized stop, awaited before the new stream starts, so the prior
   *  utterance's Speech.stop() cannot kill this stream's first sentence. */
  stopInFlight: () => Promise<void>;
  /** Test seam for placeholder choice. */
  pickPlaceholder?: () => string;
}

export interface AutoSpeakController {
  /** Open a stream for `messageId`. No-op when auto-speak is off. */
  begin: (messageId: string) => void;
  /** Feed one reply-text delta. */
  append: (chunk: string) => void;
  /** Feed cumulative reasoning so the placeholder can be armed. */
  noteReasoning: (cumulative: string) => void;
  /** Flush and wait for playback to drain. */
  finish: () => Promise<void>;
  /** Abort playback and drop the buffer. Safe when idle. */
  stop: () => void;
  /** Which message currently owns the stream, if any. */
  activeMessageId: () => string | null;
}

export function createAutoSpeak(deps: AutoSpeakDeps): AutoSpeakController {
  let handle: StreamingHandle | null = null;
  let messageId: string | null = null;
  let reasoningSeen = false;
  let placeholderEmitted = false;
  /** A begin() racing its own resolve: appends land here until it lands. */
  let starting = false;
  const buffered: string[] = [];

  function reset(): void {
    handle = null;
    messageId = null;
    reasoningSeen = false;
    placeholderEmitted = false;
    starting = false;
    buffered.length = 0;
  }

  function emit(text: string): void {
    if (!handle || starting) {
      buffered.push(text);
      return;
    }
    handle.appendText(text);
  }

  function stop(): void {
    const stream = handle;
    reset();
    if (stream) void stream.cancel().catch(() => undefined);
  }

  return {
    activeMessageId: () => messageId,

    begin(id) {
      if (!deps.isEnabled()) return;
      // One stream per message: a repeat begin for the same reply is a
      // no-op, and a begin for a new reply supersedes the old stream.
      if (id === messageId && (handle !== null || starting)) return;
      stop();
      messageId = id;
      starting = true;
      void (async () => {
        try {
          const { engine, voice } = await deps.resolve();
          const stream = engine.playStreaming(voice, deps.stopInFlight());
          if (messageId !== id) {
            // Superseded while resolving; drop this stream unplayed.
            void stream.cancel();
            return;
          }
          handle = stream;
          starting = false;
          for (const chunk of buffered) stream.appendText(chunk);
          buffered.length = 0;
        } catch (err) {
          console.warn("[tts] auto-speak could not start:", err);
          if (messageId === id) reset();
        }
      })();
    },

    append(chunk) {
      if (messageId === null || chunk === "") return;
      if (reasoningSeen && !placeholderEmitted) {
        placeholderEmitted = true;
        emit(`${deps.pickPlaceholder?.() ?? THINKING_PLACEHOLDERS[0]} `);
      }
      emit(chunk);
    },

    noteReasoning(cumulative) {
      if (cumulative.trim() !== "") reasoningSeen = true;
    },

    async finish() {
      const stream = handle;
      const wasStarting = starting;
      if (stream === null && !wasStarting) {
        reset();
        return;
      }
      try {
        await stream?.finalize();
      } catch (err) {
        console.warn("[tts] auto-speak finalize failed:", err);
      } finally {
        reset();
      }
    },

    stop,
  };
}

/** App controller. System default voice when none is selected; the native
 *  modules load lazily so this file stays importable in node tests. */
export const autoSpeak = createAutoSpeak({
  isEnabled: () => useVoice.getState().autoSpeak,
  resolve: async () => {
    const [{ getEngine }, { resolveSystemDefaultVoice }] = await Promise.all([
      import("./engineRegistry.ts"),
      import("./engines/system.ts"),
    ]);
    const voice = useVoice.getState().currentVoice ?? (await resolveSystemDefaultVoice());
    return { engine: getEngine(voice.engine), voice };
  },
  stopInFlight: async () => {
    const { ttsRuntime } = await import("./runtime.ts");
    await ttsRuntime.stop();
  },
});