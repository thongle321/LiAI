/** Phonon support gating in the voice store (parity item 2, #1009).
 *
 * PocketPal's contract (TTSStore.refreshPhononSupport / isEngineOffered):
 * a probe from the native add-on decides whether Phonon is offered; the
 * store re-probes when a Phonon load fails, and an unsupported probe clears
 * a selected Phonon voice WITHOUT stashing it — its files stay on disk and
 * the stash path belongs to downloads, not support loss.
 *
 * Jest runs the app's probe mock (`jest.config.js` maps the speech module),
 * so tests drive `getEngineSupport` per case.
 */

import Speech from "@pocketpalai/react-native-speech";

import { createVoiceStore, VOICE_KEY } from "../voice";
import { memoryStorage } from "@/jest/storage";
import { DEVICE_DEFAULT_VOICE } from "@/services/tts/types";
import { PHONON_VOICES } from "@/services/tts/engines/phonon/voices";

const speakMock = Speech as unknown as jest.MockedObjectDeep<typeof Speech>;

const phononVoice = PHONON_VOICES[0]!;

describe("voice store Phonon support gating", () => {
  it("offers Phonon when the add-on probe reports supported", async () => {
    speakMock.getEngineSupport.mockResolvedValue({
      supported: true,
      reason: "",
    });
    const useStore = createVoiceStore(memoryStorage());

    await useStore.getState().load();

    expect(useStore.getState().phononSupported).toBe(true);
    expect(useStore.getState().isEngineOffered("phonon")).toBe(true);
    expect(useStore.getState().isEngineOffered("kitten")).toBe(true);
  });

  it("hides Phonon when the probe says unsupported, other cards stay", async () => {
    speakMock.getEngineSupport.mockResolvedValue({
      supported: false,
      reason: "not-compiled",
    });
    const useStore = createVoiceStore(memoryStorage());

    await useStore.getState().load();

    expect(useStore.getState().phononSupported).toBe(false);
    expect(useStore.getState().isEngineOffered("phonon")).toBe(false);
    expect(useStore.getState().isEngineOffered("kitten")).toBe(true);
    expect(useStore.getState().isEngineOffered("kokoro")).toBe(true);
  });

  it("a failed probe counts as unsupported", async () => {
    speakMock.getEngineSupport.mockRejectedValue(new Error("no module"));
    const useStore = createVoiceStore(memoryStorage());

    await useStore.getState().load();

    expect(useStore.getState().isEngineOffered("phonon")).toBe(false);
  });

  it("an unsupported probe clears a selected Phonon voice without stashing", async () => {
    speakMock.getEngineSupport.mockResolvedValue({
      supported: false,
      reason: "not-compiled",
    });
    const useStore = createVoiceStore(memoryStorage());
    await useStore.getState().load();
    useStore.getState().setCurrentVoice({
      id: phononVoice.id,
      name: phononVoice.name,
      engine: "phonon",
    });

    await useStore.getState().refreshPhononSupport();

    const s = useStore.getState();
    expect(s.currentVoice).toEqual(DEVICE_DEFAULT_VOICE);
    // No stash: a re-download cannot fix a missing native probe.
    expect(s.pendingVoiceRestore.phonon).toBeUndefined();
  });

  it("an unsupported probe leaves a non-phonon voice alone", async () => {
    speakMock.getEngineSupport.mockResolvedValue({
      supported: false,
      reason: "not-compiled",
    });
    const useStore = createVoiceStore(memoryStorage());
    await useStore.getState().load();
    useStore.getState().setCurrentVoice(DEVICE_DEFAULT_VOICE);

    await useStore.getState().refreshPhononSupport();

    expect(useStore.getState().currentVoice).toEqual(DEVICE_DEFAULT_VOICE);
  });
});
