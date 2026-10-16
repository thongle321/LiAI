/** Voice selection: which of the device's voices to offer (ADR-0013).
 *
 * Pure on purpose. expo-speech's device list runs past 100 entries, which
 * is not a list anyone reads, so this narrows it to something a picker can
 * actually be scanned through. Kept out of the component because jest
 * cannot import a screen.
 *
 * Matching is on the primary subtag ("en-GB" -> "en") so regional variants
 * of the device's own language sit together instead of being filtered out by
 * an exact match. A locale with no installed voices falls back to the full
 * list rather than offering an empty picker.
 */

/** Structural slice of expo-speech's Voice that this module reads. */
export interface DeviceVoice {
  identifier: string;
  name: string;
  language: string;
  quality: string;
}

/** Sentinel for "let the platform choose"; PickerRow needs a string value. */
export const SYSTEM_VOICE = "";

const QUALITY_RANK: Record<string, number> = { premium: 0, enhanced: 1, default: 2 };

/** Primary subtag: "en-GB" -> "en". */
export function primaryLanguage(language: string): string {
  return language.split(/[-_]/)[0].toLowerCase();
}

/** Device locale, via Intl rather than taking on a native dependency. */
export function deviceLanguage(): string {
  try {
    return primaryLanguage(Intl.DateTimeFormat().resolvedOptions().locale);
  } catch {
    return "";
  }
}

/** Better quality first, then alphabetical, so the list is stable. */
function byPreference(a: DeviceVoice, b: DeviceVoice): number {
  return (
    (QUALITY_RANK[a.quality] ?? 3) - (QUALITY_RANK[b.quality] ?? 3) ||
    a.name.localeCompare(b.name)
  );
}

/** Locale-first, never empty. */
export function filterVoices(voices: DeviceVoice[], language: string): DeviceVoice[] {
  const mine = voices
    .filter((v) => primaryLanguage(v.language) === language)
    .sort(byPreference);
  return mine.length > 0 ? mine : [...voices].sort(byPreference);
}

/** Picker options, with the stored voice kept in the list even when this
 *  device no longer offers it — otherwise the row would show a blank. */
export function voiceOptions(voices: DeviceVoice[], voiceId: string | null): string[] {
  const known = new Set(voices.map((v) => v.identifier));
  return [
    SYSTEM_VOICE,
    ...voices.map((v) => v.identifier),
    ...(voiceId && !known.has(voiceId) ? [voiceId] : []),
  ];
}
