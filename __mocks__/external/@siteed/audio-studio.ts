/** Jest mock for `@siteed/audio-studio` (hooks/useVoiceCapture.ts).
 *
 * The recorder is a native module; under Jest it is inert. `useAudioRecorder`
 * hands back a recorder whose `startRecording` resolves and `stopRecording`
 * resolves, so a capture simply runs without audio and never delivers chunks.
 */

export interface AudioDataEvent {
  data: string;
}

export function useAudioRecorder(): {
  startRecording: (opts: unknown) => Promise<void>;
  stopRecording: () => Promise<void>;
} {
  return {
    startRecording: jest.fn(async () => {}),
    stopRecording: jest.fn(async () => {}),
  };
}

