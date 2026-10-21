/**
 * The engine card's controller, apart from the view.
 *
 * The pure rules live in services/tts/voiceUi.ts; this holds the wiring the
 * hook owns: which voice is previewing, the remove confirmation, and the
 * error-note lifecycle. Driven through the real store, faked play/stop.
 */

import { act, renderHook, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

import { useEngineCardController } from "../use-engine-card-controller.ts";
import { EMPTY_DOWNLOADS, useVoice } from "@/store/voice.ts";
import type { Voice } from "@/services/tts/types.ts";
import { DEVICE_DEFAULT_VOICE } from "@/services/tts/types.ts";

const READY = { state: "ready", percent: 100 } as const;

const KOKORO_VOICE: Voice = { id: "kokoro-0", name: "Kokoro AF", engine: "kokoro" };

function deferred<T = void>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

function seed(over: Record<string, unknown> = {}): void {
  const playDef = deferred();
  useVoice.setState({
    currentVoice: DEVICE_DEFAULT_VOICE,
    activeEngineId: null,
    downloads: { ...EMPTY_DOWNLOADS, kokoro: READY },
    play: jest.fn(() => playDef.promise),
    stop: jest.fn().mockResolvedValue(undefined),
    setCurrentVoice: (v: Voice) => useVoice.setState({ currentVoice: v }),
    startEngineDownload: jest.fn(),
    pauseEngineDownload: jest.fn(),
    resumeEngineDownload: jest.fn(),
    removeEngineModel: jest.fn().mockResolvedValue(undefined),
    ...over,
  } as never);
}

function setup(): ReturnType<typeof renderHook<ReturnType<typeof useEngineCardController>, unknown>> {
  return renderHook(() => useEngineCardController("kokoro"));
}

afterEach(() => {
  jest.restoreAllMocks();
  seed();
});

describe("useEngineCardController", () => {
  it("starts collapsed and not installable when the model is ready", () => {
    seed();
    const { result } = setup();

    expect(result.current.expanded).toBe(false);
    expect(result.current.group.kind).toBe("ready");
    expect(result.current.installable).toBe(false);
  });

  it("installs the model when the card has nothing yet", () => {
    seed({ downloads: { ...EMPTY_DOWNLOADS, kokoro: { state: "not_installed", percent: 0 } } });
    const { result } = setup();

    expect(result.current.group.kind).toBe("install");
    expect(result.current.installable).toBe(true);
  });

  it("previews a tapped voice and clears the note", async () => {
    const playDef = deferred();
    seed({ play: jest.fn(() => playDef.promise) });
    const { result } = setup();

    act(() => {
      result.current.onTapVoice(KOKORO_VOICE);
    });

    expect(result.current.previewingId).toBe(KOKORO_VOICE.id);
    expect(result.current.errorNote).toBeNull();
    expect(result.current.currentVoice?.id).toBe(KOKORO_VOICE.id);
    expect(useVoice.getState().play).toHaveBeenCalled();

    // resolve the preview inside act() so the finally settles cleanly
    await act(async () => {
      playDef.resolve();
    });
  });

  it("stops the preview when the same voice is tapped again", async () => {
    const playDef = deferred();
    seed({ play: jest.fn(() => playDef.promise) });
    const { result } = setup();

    act(() => {
      result.current.onTapVoice(KOKORO_VOICE);
    });
    // tap again while the first preview is still active
    act(() => {
      result.current.onTapVoice(KOKORO_VOICE);
    });

    expect(result.current.previewingId).toBeNull();
    expect(useVoice.getState().stop).toHaveBeenCalled();

    // resolve the orphaned preview so its finally settles cleanly
    await act(async () => {
      playDef.resolve();
    });
  });

  it("records the message when a previewed voice fails to play", async () => {
    const play = jest.fn().mockRejectedValue(new Error("boom"));
    seed({ play });
    const { result } = setup();

    act(() => {
      result.current.onTapVoice(KOKORO_VOICE);
    });

    // the rejection lands asynchronously; the catch sets the note
    await waitFor(() => expect(result.current.errorNote).toBe("boom"));
  });

  it("treats a tap on another engine's voice as unavailable", () => {
    seed();
    const { result } = setup();
    const other: Voice = { id: "kitten-0", name: "Kitten", engine: "kitten" };

    act(() => {
      result.current.onTapVoice(other);
    });

    expect(result.current.previewingId).toBeNull();
    expect(useVoice.getState().play).not.toHaveBeenCalled();
  });

  it("confirms before removing, and cleans up on Remove", () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
      const remove = buttons?.find((b) => b.text === "Remove");
      remove?.onPress?.();
    });
    seed();
    const { result } = setup();

    act(() => {
      result.current.onRemove();
    });

    expect(alert).toHaveBeenCalled();
    expect(result.current.previewingId).toBeNull();
    expect(result.current.errorNote).toBeNull();
    expect(useVoice.getState().removeEngineModel).toHaveBeenCalledWith("kokoro");
  });
});