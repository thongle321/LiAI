/** Jest mock for `expo-speech` (lib/voiceSpeak.ts, lib/tts/engines/system.ts).
 *
 * `expo-speech` reaches for the OS speech synthesizer, which does not exist
 * under Jest. This mock records calls instead: a test drives a caller and
 * asserts what was asked of the OS, and can install its own implementation
 * with `jest.mocked(Speech.speak).mockImplementation(...)` to simulate the
 * utterance finishing, stopping or failing. `jest.resetAllMocks()` in
 * jest.setup.ts clears recorded calls between tests.
 */

export interface MockSpeechOptions {
  language?: string;
  voice?: string;
  pitch?: number;
  rate?: number;
  volume?: number;
  onDone?: () => void;
  onStopped?: () => void;
  onError?: () => void;
}

export const speak = jest.fn(
  (_text: string, _options?: MockSpeechOptions): void => {},
);

export const stop = jest.fn(async (): Promise<void> => {});
export const pause = jest.fn(async (): Promise<void> => {});
export const resume = jest.fn(async (): Promise<void> => {});
export const isSpeakingAsync = jest.fn(async (): Promise<boolean> => false);
export const getAvailableVoicesAsync = jest.fn(
  async (): Promise<Array<Record<string, unknown>>> => [],
);
export const maxSpeechInputLength = Number.MAX_SAFE_INTEGER;

export default {
  speak,
  stop,
  pause,
  resume,
  isSpeakingAsync,
  getAvailableVoicesAsync,
  maxSpeechInputLength,
};
