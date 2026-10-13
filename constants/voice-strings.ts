/** Voice feature strings (spec Q17).
 *
 * LiAI has no i18n layer, so every user-facing voice string is English
 * and lives in this one module — a future `t()` swap edits here, not
 * every screen. Strings used once stay at their call site; only strings
 * shared by two or more surfaces move in.
 */

/** Spoken by the Preview button and the kokoro voice rows, so the user
 *  hears the voice they picked rather than the words they just read. */
export const VOICE_PREVIEW_SAMPLE =
  "Oh, hello there! I've been waiting for you to test me. I sound pretty good!";

/** Kokoro engine card facts (spec Q8 + ticket-02 findings: 98.5 MB int8
 *  English model, 11 speakers). */
export const KOKORO_TITLE = "Kokoro";
export const KOKORO_BADGE = "NATURAL";
export const KOKORO_SPEC = "11 voices · 99 MB · offline after download";
