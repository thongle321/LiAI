/** Speakable text out of raw assistant text: drop reasoning/thinking
 * markup and markdown-lite junk (spec Q10), then normalize whitespace so
 * the result reads naturally aloud. */

const THINK_OPEN = "\u003cthink\u003e";
const THINK_CLOSE = "\u003c/think\u003e";
const REASONING_OPEN = "\u003creasoning\u003e";
const REASONING_CLOSE = "\u003c/reasoning\u003e";

/** Open/close pairs, ported from PocketPal's ThinkingStripper: a
 * feed/flush state machine with partial-suffix hold-back, run once over
 * the final string. An unclosed tag drops the remainder (flush). */
const TAG_PAIRS: ReadonlyArray<readonly [string, string]> = [
  [THINK_OPEN, THINK_CLOSE],
  [REASONING_OPEN, REASONING_CLOSE],
];

/** Length of the longest suffix of `text` that is a proper prefix of
 * `pattern` — how much trailing text might be a half-arrived tag. */
function partialSuffixMatch(text: string, pattern: string): number {
  const max = Math.min(text.length, pattern.length - 1);
  for (let n = max; n > 0; n--) {
    if (text.endsWith(pattern.slice(0, n))) return n;
  }
  return 0;
}

function stripThinkTags(text: string): string {
  let out = "";
  let i = 0;
  let closer: string | null = null;
  for (;;) {
    if (closer === null) {
      // Outside: jump to the nearest opener.
      let openIdx = -1;
      let open = "";
      let pairCloser = "";
      for (const [o, c] of TAG_PAIRS) {
        const idx = text.indexOf(o, i);
        if (idx !== -1 && (openIdx === -1 || idx < openIdx)) {
          openIdx = idx;
          open = o;
          pairCloser = c;
        }
      }
      if (openIdx === -1) {
        // No opener left: hold back any half-arrived opener (dropped at
        // flush, matching PocketPal) and emit the rest.
        let keep = 0;
        for (const [o] of TAG_PAIRS) {
          keep = Math.max(keep, partialSuffixMatch(text.slice(i), o));
        }
        out += text.slice(i, text.length - keep);
        return out;
      }
      out += text.slice(i, openIdx);
      i = openIdx + open.length;
      closer = pairCloser;
    } else {
      // Inside: drop content up to our closer.
      const closeIdx = text.indexOf(closer, i);
      if (closeIdx === -1) {
        // Unclosed tag — flush drops the remainder.
        return out;
      }
      i = closeIdx + closer.length;
      closer = null;
    }
  }
}

export function stripForSpeech(text: string): string {
  return stripThinkTags(text)
    // Fenced code: ``` to ``` (or end — an unclosed fence drops the rest,
    // same flush semantics as an unclosed think tag).
    .replace(/```[\s\S]*?(?:```|$)/g, "")
    // Inline code spans go whole (ticket: inline code removed); bold
    // markers go, the words stay.
    .replace(/`[^`\n]*`/g, "")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    // Images drop whole, links keep only the label, bare URLs drop.
    // Images before links so the leading "!" never survives alone.
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    // Table rows (lines starting with "|") drop whole.
    .replace(/^[ \t]*\|.*$/gm, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
