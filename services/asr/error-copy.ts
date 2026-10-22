/** Human copy for ASR errors (PocketParity en.json voiceInput.*).
 *
 * The store keeps the machine kind (AsrErrorKind); every surface — the
 * snackbar here, the settings rows later — reads words through this one
 * map, so the copy never drifts per screen.
 */

import type { AsrErrorKind } from "./types.ts";

/** PocketPal's Open Settings action label, verbatim. */
export const OPEN_SETTINGS_LABEL = "Open Settings";

/** PocketPal en.json error copy, verbatim (brand-neutral). */
export function asrErrorCopy(kind: AsrErrorKind): string {
  switch (kind) {
    case "permission_denied":
      return "Microphone access is needed for voice input.";
    case "permission_blocked":
      return "Microphone access is blocked. Enable it in Settings.";
    case "transcribe_failed":
      return "Couldn't transcribe — please try again.";
    case "not_installed":
      return "Download a voice model to use voice input.";
    case "insufficient_memory":
      return "Not enough memory for voice input with this chat model. Try a smaller model.";
    case "mic_unavailable":
      return "The microphone isn't responding. Try again, or switch to a smaller chat model.";
    case "transcript_partial":
      return "Part of your dictation couldn't be transcribed.";
    default:
      return "Voice input failed.";
  }
}

/** The download preflight's denial, worded like PocketPal's
 *  voiceInput.insufficientStorage template. Whole-MB figures. */
export function insufficientStorageCopy(
  requiredBytes: number,
  freeBytes: number | null,
): string {
  const requiredMb = Math.floor(requiredBytes / 1_000_000);
  const freeMb = freeBytes === null ? 0 : Math.floor(freeBytes / 1_000_000);
  return `Not enough space — free up ${requiredMb} MB to install this model (${freeMb} MB available).`;
}

/** Which error kind's surface gets the Open Settings affordance — only a
 *  blocked permission: a denied one is re-askable in-session, and nothing
 *  else touches the OS Settings (PocketParity rule). */
export function hasOpenSettingsAction(kind: AsrErrorKind): boolean {
  return kind === "permission_blocked";
}
