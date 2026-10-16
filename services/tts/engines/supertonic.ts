/** Supertonic neural TTS engine — the FAST START pack.
 *
 * A diffusion TTS model: sherpa-onnx ships it as a single int8 archive,
 * `sherpa-onnx-supertonic-3-tts-int8-2026-05-11` (122.8 MiB), the same
 * v3 generation PocketPal targets through their speech fork. We get it
 * from sherpa instead, so the pipeline is native to the library we already
 * depend on.
 *
 * Unlike the other two, sherpa exposes NO knobs for this model type
 * (`TtsSupertonicModelOptions` is an empty interface), so PocketPal's
 * language picker and diffusion-steps control have no seam here and are
 * deliberately absent. Revisit when the library grows those options.
 *
 * VOICE TABLE — READ BEFORE EDITING. Same caveat as Kitten: no sherpa
 * generator script pins this order, so it is PocketPal's 10-voice catalog
 * carried over UNVERIFIED against sherpa's speaker list. The ids double as
 * the style-file names PocketPal fetches per voice; sherpa addresses the
 * model by integer speaker id, so list order IS sid order. Correct from a
 * device reading before trusting it.
 */

/** The 10 voices of supertonic-3, in sid order (see the file note). */
const SUPERTONIC_SPEAKERS: ReadonlyArray<{ sid: string; name: string }> = [
  { sid: "F1", name: "Sarah" },
  { sid: "F2", name: "Lily" },
  { sid: "F3", name: "Jessica" },
  { sid: "F4", name: "Olivia" },
  { sid: "F5", name: "Emily" },
  { sid: "M1", name: "Alex" },
  { sid: "M2", name: "James" },
  { sid: "M3", name: "Robert" },
  { sid: "M4", name: "Sam" },
  { sid: "M5", name: "Daniel" },
];

export const SUPERTONIC_VOICES = SUPERTONIC_SPEAKERS.map((speaker) => ({
  id: speaker.sid,
  name: speaker.name,
  engine: "supertonic" as const,
}));