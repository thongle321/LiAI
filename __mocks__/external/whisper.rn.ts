/** whisper.rn fake: the native context is never real under jest. Suites
 *  exercise the seams around the engine (store, cascade controller) with
 *  injected fakes; this mock only keeps a static import of
 *  `services/asr/engines/whisper.ts` loadable so barrel imports resolve.
 */

export interface FakeWhisperContext {
  transcribeData: (_data: string, _opts: unknown) => Promise<{
    result: string;
    language: string;
    isAborted: boolean;
    stop: () => Promise<void>;
  }>;
  release: () => Promise<void>;
}

export const initWhisper = jest.fn(
  async (_config: unknown): Promise<FakeWhisperContext> => {
    return {
      transcribeData: async () => {
        return {
          result: "",
          language: "en",
          isAborted: false,
          stop: async () => {},
        };
      },
      release: async () => {},
    };
  },
);

export type WhisperContext = FakeWhisperContext;
