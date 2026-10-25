/** Voice-mode session timings and limits (pocketpal-ai
 *  src/services/voice/constants.ts, values verbatim). */

/** Silence after speech that ends an utterance (ms). */
export const VOICE_ENDPOINT_HANG_MS = 600;

/**
 * Wait after stopping the mic before starting it again (ms): on Android the
 * recorder's read thread releases the shared recorder when it ends, so a
 * restart sooner can lose the new recorder.
 */
export const VOICE_CAPTURE_SETTLE_MS = 150;

/**
 * A started mic that delivers no audio within this long (ms) is restarted
 * once, then voice mode ends. Bringing up a Bluetooth headset's mic route
 * takes 1–3 s.
 */
export const VOICE_MIC_WATCHDOG_MS = 3000;

/**
 * Loading Whisper longer than this (ms) ends the start with a issue line.
 * A first load on a mid-range phone took about 21 s.
 */
export const VOICE_START_TIMEOUT_MS = 45_000;
