/** Stateful `<think>…</think>` stripper for streaming TTS, ported from
 *  pocketpal-ai's `src/services/tts/thinkingStripper.ts`.
 *
 *  Holds back partial tags across chunks so a split tag never leaks into
 *  speech, and tracks whether a non-empty think block was seen so callers
 *  can emit a spoken placeholder ("Hmm, let me think.").
 */

const THINK_OPEN = "<think>";
const THINK_CLOSE = "</think>";

const PLACEHOLDERS = [
  "Hmm, let me think.",
  "Hmm.",
  "Let me think.",
  "Okay, let me think about that.",
  "One moment.",
  "Let me consider this.",
];

export const pickThinkingPlaceholder = (
  rng: () => number = Math.random,
): string => PLACEHOLDERS[Math.floor(rng() * PLACEHOLDERS.length)];

const partialSuffixMatch = (text: string, pattern: string): number => {
  const max = Math.min(text.length, pattern.length - 1);
  for (let n = max; n > 0; n--) {
    if (text.endsWith(pattern.slice(0, n))) {
      return n;
    }
  }
  return 0;
};

export class ThinkingStripper {
  private buffer = "";
  private inside = false;
  private nonEmptyThink = false;

  feed(chunk: string): string {
    this.buffer += chunk;
    let out = "";
    while (this.buffer.length > 0) {
      if (!this.inside) {
        const openIdx = this.buffer.indexOf(THINK_OPEN);
        if (openIdx === -1) {
          const keep = partialSuffixMatch(this.buffer, THINK_OPEN);
          out += this.buffer.slice(0, this.buffer.length - keep);
          this.buffer = this.buffer.slice(this.buffer.length - keep);
          break;
        }
        out += this.buffer.slice(0, openIdx);
        this.buffer = this.buffer.slice(openIdx + THINK_OPEN.length);
        this.inside = true;
      } else {
        const closeIdx = this.buffer.indexOf(THINK_CLOSE);
        if (closeIdx === -1) {
          const keep = partialSuffixMatch(this.buffer, THINK_CLOSE);
          const frag = this.buffer.slice(0, this.buffer.length - keep);
          if (frag.trim().length > 0) {
            this.nonEmptyThink = true;
          }
          this.buffer = this.buffer.slice(this.buffer.length - keep);
          break;
        }
        const frag = this.buffer.slice(0, closeIdx);
        if (frag.trim().length > 0) {
          this.nonEmptyThink = true;
        }
        this.buffer = this.buffer.slice(closeIdx + THINK_CLOSE.length);
        this.inside = false;
      }
    }
    return out;
  }

  flush(): string {
    if (this.inside) {
      this.buffer = "";
      return "";
    }
    const maybePartial = partialSuffixMatch(this.buffer, THINK_OPEN);
    const out = this.buffer.slice(0, this.buffer.length - maybePartial);
    this.buffer = "";
    return out;
  }

  hadNonEmptyThink(): boolean {
    return this.nonEmptyThink;
  }

  noteReasoning(delta: string): void {
    if (delta && delta.trim().length > 0) {
      this.nonEmptyThink = true;
    }
  }

  static stripFinal(
    text: string,
    opts?: { hadReasoning?: boolean },
  ): { text: string; hadNonEmptyThink: boolean } {
    const s = new ThinkingStripper();
    const out = s.feed(text) + s.flush();
    if (opts?.hadReasoning) {
      s.noteReasoning("x");
    }
    return { text: out, hadNonEmptyThink: s.hadNonEmptyThink() };
  }
}