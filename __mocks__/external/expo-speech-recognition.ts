/** Jest mock for `expo-speech-recognition`
 * (services/voice/mic-access.ts, hooks/useVoiceLoop.ts, hooks/useVisionTurn.ts).
 *
 * The recognizer is a native module with a live audio session; under Jest it
 * can only be modelled. `ExpoSpeechRecognitionModule` exposes `jest.fn()`
 * members so a test can assert permission calls, and the event helpers are
 * inert: no listener is ever called, so a hook that waits for a transcript
 * simply stays in its current phase.
 */

export interface MockPermissionResponse {
  granted: boolean;
  status: "granted" | "denied" | "undetermined";
  canAskAgain: boolean;
}

const undetermined: MockPermissionResponse = {
  granted: false,
  status: "undetermined",
  canAskAgain: true,
};

export const getPermissionsAsync = jest.fn(
  async (): Promise<MockPermissionResponse> => ({ ...undetermined }),
);

export const requestPermissionsAsync = jest.fn(
  async (): Promise<MockPermissionResponse> => ({ ...undetermined }),
);

export const start = jest.fn(async (): Promise<void> => {});
export const stop = jest.fn(async (): Promise<void> => {});
export const abort = jest.fn(async (): Promise<void> => {});

export const ExpoSpeechRecognitionModule = {
  start,
  stop,
  abort,
  getPermissionsAsync,
  requestPermissionsAsync,
};

/** Inert under Jest: the listener is stored and never invoked. */
export function useSpeechRecognitionEvent(
  _event: string,
  _listener: (payload: unknown) => void,
): void {}

export default ExpoSpeechRecognitionModule;
