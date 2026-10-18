/** Shared speech-recognition start options (dictation + voice mode). */

// Full BCP-47 locale tag (e.g. "en-US"), not just the primary subtag, so
// the recognizer gets a complete language tag (D5-8).
function deviceLocaleTag(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || "en-US";
  } catch {
    return "en-US";
  }
}

export const VOICE_LISTEN_OPTS = {
  // Derive from the device locale instead of hardcoding en-US (D5-8).
  lang: deviceLocaleTag(),
  interimResults: true,
  continuous: false,
  // On-device: Google's server was answering ERROR_SERVER ("network"
  // failure on screen), so skip it. Ignored where unsupported, in
  // which case recognition falls back to the network as before.
  requiresOnDeviceRecognition: true,
} as const;

/** Merge an STT transcript into the draft: interim updates replace the
 * dictated tail (the pre-dictation base is kept), so the user reviews
 * the words and presses Send themselves — dictation never sends. */
export function mergeDictation(base: string, transcript: string): string {
  const said = transcript.trim();
  if (said === "") return base;
  return base === "" ? said : `${base} ${said}`;
}
