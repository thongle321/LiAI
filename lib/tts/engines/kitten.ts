/** Kitten neural TTS engine — the LIGHTWEIGHT pack.
 *
 * KittenTTS nano (15M StyleTTS2), English only, and the smallest thing on
 * this screen: `kitten-nano-en-v0_8-int8` is a 29.8 MiB archive in
 * sherpa-onnx's `tts-models` release. It is the engine to reach for on a
 * device that cannot hold the others.
 *
 * VOICE TABLE — READ BEFORE EDITING. Unlike kokoro, whose sid→name order is
 * pinned to sherpa's own `generate_voices_bin.py`, there is no generator
 * script to read for Kitten, so this order is PocketPal's (their 8-voice
 * nano catalog, same model generation) carried over UNVERIFIED. sherpa
 * addresses Kitten by integer speaker id exactly as it does kokoro, so if
 * that order is wrong every voice past the first is mislabelled the same
 * way kokoro's were. `getNumSpeakers()` is wired in as the cheap tripwire
 * for a count change; it cannot catch a pure reorder. Correct this table
 * from a device reading of the speaker list before trusting it.
 */

/** The 8 voices of kitten-nano-en-v0_8, in sid order (see the file note). */
const KITTEN_SPEAKERS: ReadonlyArray<{ sid: string; name: string }> = [
  { sid: "expr-voice-2-f", name: "Bella" },
  { sid: "expr-voice-3-f", name: "Luna" },
  { sid: "expr-voice-4-f", name: "Rosie" },
  { sid: "expr-voice-5-f", name: "Kiki" },
  { sid: "expr-voice-2-m", name: "Jasper" },
  { sid: "expr-voice-3-m", name: "Bruno" },
  { sid: "expr-voice-4-m", name: "Hugo" },
  { sid: "expr-voice-5-m", name: "Leo" },
];

export const KITTEN_VOICES = KITTEN_SPEAKERS.map((speaker) => ({
  id: speaker.sid,
  name: speaker.name,
  engine: "kitten" as const,
}));