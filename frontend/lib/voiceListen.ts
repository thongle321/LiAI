/** Shared speech-recognition start options (dictation + voice mode). */

export const VOICE_LISTEN_OPTS = {
  lang: "en-US",
  interimResults: true,
  continuous: false,
} as const;

/** Merge an STT transcript into the draft: interim updates replace the
 * dictated tail (the pre-dictation base is kept), so the user reviews
 * the words and presses Send themselves — dictation never sends. */
export function mergeDictation(base: string, transcript: string): string {
  const said = transcript.trim();
  if (said === "") return base;
  return base === "" ? said : `${base} ${said}`;
}
