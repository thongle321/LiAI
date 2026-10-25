/** useVoiceMode: the session controller's entry gates, turn wiring and
 *  exits (trimmed from PocketPal's useVoiceMode tests to the LiAI
 *  surface: no teaser/paywall, no mute, no audio interruption).
 *
 *  Seams: a fake engine (prepare/release/runTurn with controllable
 *  events), a fake VoiceChatPort, a fake capture, the real asr store,
 *  and a mocked mic-access module. */
import { act, renderHook, waitFor } from "@testing-library/react-native";

import { useVoiceMode } from "@/hooks/useVoiceMode.ts";
import type { VoiceModeDeps, VoiceCapture } from "@/hooks/useVoiceMode.ts";
import type { AsrTier } from "@/services/asr/types.ts";
import type {
  VoiceEngine,
  VoiceTurn,
  VoiceTurnEvents,
  VoiceTurnOutcome,
  VoiceTurnPort,
} from "@/services/voice/types.ts";
import type { VoiceChatPort } from "@/services/voice/chat-port.ts";
import { useAsrStore } from "@/store/asr.ts";
import { useVoice } from "@/store/voice.ts";

jest.mock("@/services/voice/mic-access.ts", () => ({
  ensureMicAccess: jest.fn(async () => "granted"),
  // Entry's CHECK must never prompt; the ask belongs to the setup sheet.
  checkMicAccess: jest.fn(async () => "granted"),
}));

// The real recorder is native-only; the hook's capture seam is faked, and
// this stub just keeps the module's import graph loadable.
jest.mock("@siteed/audio-studio", () => ({
  useAudioRecorder: () => ({
    startRecording: jest.fn(async () => {}),
    stopRecording: jest.fn(),
  }),
}));

/** Focus, read at render time; suites run focused unless pinned false. */
let focusNow = true;

jest.mock("expo-router", () => ({
  ...jest.requireActual("expo-router"),
  useIsFocused: () => focusNow,
}));

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
const micAccess = jest.requireMock("@/services/voice/mic-access.ts");
const ensureMicAccess = micAccess.ensureMicAccess as Function;
const checkMicAccess = micAccess.checkMicAccess as Function;

/** 400 ms of voiced square wave; clears the engine VAD. */
function voicedPcm(ms = 400): Uint8Array {
  const samples = (16_000 * ms) / 1000;
  const pcm = new Uint8Array(samples * 2);
  const view = new DataView(pcm.buffer);
  for (let i = 0; i < samples; i++) {
    view.setInt16(i * 2, ((i % 2 ? 1 : -1) * 0.1 * 0x7fff) | 0, true);
  }
  return pcm;
}

const silencePcm = (): Uint8Array => new Uint8Array(16_000 * 0.8 * 2);

class FakeEngine implements VoiceEngine {
  readonly id = "cascade" as const;
  prepared: AsrTier | null = null;
  released = 0;
  utterances: Uint8Array[] = [];
  events: VoiceTurnEvents | null = null;
  interrupted = 0;
  turnDone: ((outcome: VoiceTurnOutcome) => void) | null = null;

  async prepare(tier: AsrTier): Promise<void> {
    this.prepared = tier;
  }

  async release(): Promise<void> {
    this.released += 1;
  }

  runTurn(
    utterance: Uint8Array,
    port: VoiceTurnPort,
    on: VoiceTurnEvents,
  ): VoiceTurn {
    this.utterances.push(utterance);
    // Mirrors the cascade: the transcript lands, THEN the port sends it.
    this.events = {
      transcribed: (text) => {
        on.transcribed(text);
        void port.send(text, () => {}).catch(() => {});
      },
      speechStarted: () => on.speechStarted(),
    };
    return {
      done: new Promise<VoiceTurnOutcome>((resolve) => {
        this.turnDone = resolve;
      }),
      interrupt: async () => {
        this.interrupted += 1;
        this.turnDone?.("interrupted");
      },
    };
  }
}

class FakePort implements VoiceChatPort {
  lastReply: string | null = null;
  onReply: ((text: string) => void) | null = null;
  sent: string[] = [];
  stops = 0;
  ok = true;

  async send(text: string, callback: (id: string) => void): Promise<void> {
    if (!this.ok) throw new Error("send refused");
    this.sent.push(text);
    callback("turn-1");
    this.lastReply = `Reply to ${text}`;
    this.onReply?.(this.lastReply);
  }

  stop(): void {
    this.stops += 1;
  }
}

class FakeCapture implements VoiceCapture {
  started = 0;
  stopped = 0;
  chunkCb: ((pcm: Uint8Array) => void) | null = null;
  fails = false;

  async start(onChunk: (pcm: Uint8Array) => void): Promise<void> {
    if (this.fails) throw new Error("mic boom");
    this.started += 1;
    this.chunkCb = onChunk;
  }

  stop(): void {
    this.stopped += 1;
    this.chunkCb = null;
  }

  deliver(pcm: Uint8Array): void {
    this.chunkCb?.(pcm);
  }
}

interface Rig {
  engine: FakeEngine;
  port: FakePort;
  capture: FakeCapture;
  result: { current: ReturnType<typeof useVoiceMode> };
  unmount: () => void;
}

/** No RAM pressure anywhere: 8 GB Android, 1 GB chat, no tts row. */
function makeRig(over: Partial<VoiceModeDeps> = {}): Rig {
  const engine = new FakeEngine();
  const port = new FakePort();
  const capture = new FakeCapture();
  const deps: VoiceModeDeps = {
    engine,
    port,
    capture,
    isModelReady: () => true,
    deviceMemory: async () => ({ os: "android", totalBytes: 8_000_000_000 }),
    chatBytes: async () => 1_000_000_000,
    openModels: () => {},
    ...over,
  };
  const hook = renderHook(() => useVoiceMode(deps));
  return {
    engine,
    port,
    capture,
    result: hook.result as Rig["result"],
    unmount: () => hook.unmount(),
  };
}

type AsrState = ReturnType<(typeof useAsrStore)["getState"]>;

const ASR_READY: Partial<AsrState> = {
  selectedTier: "base",
  isSelectedTierReady: true,
  chatBusyOnCpu: false,
  waitingForChat: false,
  spokenLanguage: null,
};

function armStore(over: Partial<AsrState> = {}): void {
  useAsrStore.setState({ ...ASR_READY, ...over });
  useVoice.setState({ playbackState: { mode: "idle" } });
}

/** Enter happy path: tier + mic + memory all green → listening. */
async function enterOpen(rig: Rig): Promise<void> {
  await act(async () => {
    await rig.result.current.requestEntry();
  });
  await waitFor(() => {
    expect(rig.result.current.phase).toBe("listening");
  });
}

/** The mic stream that reaches an auto endpoint: ≥MIN_SPEECH voiced, then
 *  a silence chunk past the 600 ms hang. */
function deliverUtterance(rig: Rig): void {
  act(() => {
    rig.capture.deliver(voicedPcm());
    rig.capture.deliver(silencePcm());
  });
}

beforeEach(() => {
  armStore();
  (ensureMicAccess as jest.Mock).mockResolvedValue?.("granted");
  (checkMicAccess as jest.Mock).mockResolvedValue?.("granted");
});

afterEach(() => {
  jest.clearAllMocks();
});

describe("entry gates", () => {
  it("no model ready: routes to the picker, opens nothing", async () => {
    let picker = 0;
    const rig = makeRig({
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      openModels: () => void (picker += 1),
      isModelReady: () => false,
    });

    await act(async () => {
      await rig.result.current.requestEntry();
    });

    expect(picker).toBe(1);
    expect(rig.result.current.sheet).toBeNull();
    expect(rig.engine.prepared).toBeNull();
    expect(rig.result.current.phase).toBe("closed");
    expect(rig.result.current.issue).toContain("Load a chat model");
    expect(rig.capture.started).toBe(0);
  });

  it("no tier ready: the setup sheet; mic stays untouched", async () => {
    armStore({ isSelectedTierReady: false });
    const rig = makeRig();

    await act(async () => {
      await rig.result.current.requestEntry();
    });

    expect(rig.result.current.sheet).toEqual({ kind: "setup" });
    expect(ensureMicAccess).not.toHaveBeenCalled();
    expect(rig.engine.prepared).toBeNull();
  });

  it("tier ready but mic permanently blocked: the issue becomes a Settings link", async () => {
    (checkMicAccess as jest.Mock).mockResolvedValue("settings");
    const rig = makeRig();

    await act(async () => {
      await rig.result.current.requestEntry();
    });

    expect(rig.result.current.needsMicSettings).toBe(true);
    expect(rig.result.current.issue).toContain("Microphone is blocked");
    expect(rig.result.current.sheet).toBeNull();
    expect(rig.engine.prepared).toBeNull();
    // A permanent denial is beyond the sheet: the controller never asks.
    expect(ensureMicAccess).not.toHaveBeenCalled();
  });

  it("mic never asked (undetermined): the setup sheet; entry never prompts", async () => {
    (checkMicAccess as jest.Mock).mockResolvedValue("undetermined");
    const rig = makeRig();

    await act(async () => {
      await rig.result.current.requestEntry();
    });

    expect(rig.result.current.sheet).toEqual({ kind: "setup" });
    expect(ensureMicAccess).not.toHaveBeenCalled();
    expect(rig.engine.prepared).toBeNull();
    expect(rig.result.current.phase).toBe("closed");
  });

  it("sheet completing the ask re-enters through the same gates", async () => {
    (checkMicAccess as jest.Mock).mockResolvedValue("undetermined");
    const rig = makeRig();
    await act(async () => {
      await rig.result.current.requestEntry();
    });
    expect(rig.result.current.sheet).toEqual({ kind: "setup" });

    // The sheet's Continue asked and the user granted.
    (checkMicAccess as jest.Mock).mockResolvedValue("granted");
    await act(async () => {
      await rig.result.current.setupDone();
    });
    await waitFor(() => {
      expect(rig.result.current.phase).toBe("listening");
    });
    expect(ensureMicAccess).not.toHaveBeenCalled();
  });

  it("mic unavailable (stale dev build): plain issue, no Settings", async () => {
    (checkMicAccess as jest.Mock).mockResolvedValue("unavailable");
    const rig = makeRig();

    await act(async () => {
      await rig.result.current.requestEntry();
    });

    expect(rig.result.current.needsMicSettings).toBe(false);
    expect(rig.result.current.issue).toContain("rebuild the dev client");
  });

  it("all green: prepares the in-use tier and starts listening", async () => {
    const rig = makeRig();

    await act(async () => {
      await rig.result.current.requestEntry();
    });

    await waitFor(() => {
      expect(rig.result.current.phase).toBe("listening");
    });
    expect(rig.engine.prepared).toBe("base");
    expect(rig.capture.started).toBe(1);
    expect(rig.result.current.issue).toBeNull();
    expect(rig.result.current.sheet).toBeNull();
  });

  it("memory busting chat + whisper: wont_fit sheet; continueAnyway stays inert", async () => {
    const rig = makeRig({
      // 2.25 GB budget vs chat 2 GB + whisper 330 MB: refusal territory.
      deviceMemory: async () => ({ os: "android", totalBytes: 5_000_000_000 }),
      chatBytes: async () => 2_000_000_000,
    });

    await act(async () => {
      await rig.result.current.requestEntry();
    });

    expect(rig.result.current.phase).toBe("closed");
    expect(rig.result.current.sheet).toEqual({
      kind: "memory",
      fit: expect.objectContaining({ status: "wont_fit" }),
    });
    expect(rig.engine.prepared).toBeNull();

    // With no measured TTS bytes the fit can only be fits or wont_fit, so
    // a refused fit offers no Enter (the tight path needs a tts row).
    await act(async () => {
      await rig.result.current.continueAnyway();
    });
    expect(rig.engine.prepared).toBeNull();
    expect(rig.result.current.phase).toBe("closed");
  });

  it("memory sheet fit with zero chat bytes clears the gate outright", async () => {
    const rig = makeRig({ chatBytes: async () => 0 });

    await act(async () => {
      await rig.result.current.requestEntry();
    });

    expect(rig.result.current.phase === "listening").toBe(true);
  });
});

describe("turn wiring", () => {
  it("an auto endpoint sends the utterance: thinking then speaking then listening again", async () => {
    const rig = makeRig();
    await enterOpen(rig);

    deliverUtterance(rig);

    expect(rig.result.current.phase).toBe("transcribing");
    await waitFor(() => {
      expect(rig.engine.utterances.length).toBe(1);
    });

    // The engine reports the transcript: the screen shows the caption.
    act(() => {
      rig.engine.events?.transcribed("hello there");
    });
    expect(rig.result.current.phase).toBe("thinking");
    expect(rig.result.current.heard).toBe("hello there");

    await waitFor(() => {
      expect(rig.port.sent).toEqual(["hello there"]);
    });
    expect(rig.port.lastReply).toBe("Reply to hello there");

    act(() => {
      rig.engine.events?.speechStarted();
    });
    expect(rig.result.current.phase).toBe("speaking");
    expect(rig.result.current.reply).toBe("Reply to hello there");

    await act(async () => {
      rig.engine.turnDone?.("answered");
    });
    await waitFor(() => {
      expect(rig.result.current.phase).toBe("listening");
    });
    // Capture restarted for the next utterance.
    await waitFor(() => {
      expect(rig.capture.started).toBe(2);
    });
  });

  it("a failed send surfaces the reply_failed issue and resumes listening", async () => {
    const rig = makeRig();
    rig.port.ok = false;
    await enterOpen(rig);

    deliverUtterance(rig);
    await waitFor(() => {
      expect(rig.engine.turnDone).not.toBeNull();
    });
    await act(async () => {
      rig.engine.turnDone?.("reply_failed");
    });

    await waitFor(() => {
      expect(rig.result.current.issue).toBe("Couldn't send that. Try again.");
    });
    expect(rig.result.current.phase).toBe("listening");
  });

  it("an empty utterance is a nudge, not an error", async () => {
    const rig = makeRig();
    await enterOpen(rig);

    deliverUtterance(rig);
    await waitFor(() => {
      expect(rig.engine.turnDone).not.toBeNull();
    });
    await act(async () => {
      rig.engine.turnDone?.("empty");
    });

    expect(rig.result.current.issue).toContain("Didn't catch anything");
    expect(rig.result.current.phase).toBe("listening");
    expect(rig.port.sent).toEqual([]);
  });

  it("interrupting during a turn stops the reply and resumes listening", async () => {
    const rig = makeRig();
    await enterOpen(rig);

    deliverUtterance(rig);
    await waitFor(() => {
      expect(rig.engine.utterances.length).toBe(1);
    });
    act(() => {
      rig.engine.events?.transcribed("hello");
      rig.engine.events?.speechStarted();
    });
    expect(rig.result.current.phase).toBe("speaking");

    await act(async () => {
      rig.result.current.tapCloud();
    });

    expect(rig.engine.interrupted).toBe(1);
    await act(async () => {
      rig.engine.turnDone?.("interrupted");
    });
    expect(rig.result.current.phase).toBe("listening");
  });

  it("tapCloud ends the utterance outright when speech is live", async () => {
    const rig = makeRig();
    await enterOpen(rig);

    // Speech, then silence under the hang: still buffered, no auto
    // endpoint yet (the hang needs 600 ms and this chunk is instant).
    act(() => {
      rig.capture.deliver(voicedPcm());
      rig.result.current.tapCloud();
    });

    // The mic tap aligned with live speech hands the utterance over.
    expect(rig.engine.utterances.length).toBe(1);
    expect(rig.result.current.phase).toBe("transcribing");
  });
});

describe("mic audio seam", () => {
  it("every capture chunk hands the UI its samples without detouring the utterance", async () => {
    // The orb's level feed: the SAME chunks the endpointer sees, decoded
    // to -1..1 floats so the caller can drive SharedValues without
    // re-rendering React.
    const onMicAudio = jest.fn();
    const rig = makeRig({ onMicAudio });
    await enterOpen(rig);

    act(() => {
      rig.capture.deliver(voicedPcm(50));
    });
    expect(onMicAudio).toHaveBeenCalledTimes(1);
    const floats = onMicAudio.mock.calls[0]![0] as Float32Array;
    expect(floats).toBeInstanceOf(Float32Array);
    expect(floats.length).toBe(50 * 16); // 50 ms at 16 kHz, int16 halves it
    expect(Math.abs(floats[0]!)).toBeCloseTo(0.1, 3);

    // The endpointer's path is untouched: the same stream still lands.
    deliverUtterance(rig);
    await waitFor(() => {
      expect(rig.engine.utterances.length).toBe(1);
    });
  });

  it("the flow stops when the capture does — nothing leaks past a turn", async () => {
    const onMicAudio = jest.fn();
    const rig = makeRig({ onMicAudio });
    await enterOpen(rig);

    deliverUtterance(rig);
    await waitFor(() => {
      expect(rig.result.current.phase).toBe("transcribing");
    });
    const soFar = onMicAudio.mock.calls.length;

    // No chunks can arrive while the capture is down; nothing fakes one.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(onMicAudio.mock.calls.length).toBe(soFar);
  });
});

describe("exits", () => {
  it("End releases the engine, stops the capture and closes", async () => {
    const rig = makeRig();
    await enterOpen(rig);

    await act(async () => {
      rig.result.current.end();
    });

    expect(rig.result.current.phase).toBe("closed");
    expect(rig.engine.released).toBe(1);
    expect(rig.capture.stopped).toBe(1);
  });


  it(
    "a mic that delivers nothing restarts once, then ends the session",
    async () => {
      const rig = makeRig();
      await enterOpen(rig);

      // Advance past the watchdog with no chunks: one silent restart.
      await waitFor(
        () => {
          expect(rig.capture.started).toBe(2);
        },
        { timeout: 9000 },
      );
      expect(rig.result.current.phase).toBe("listening");

      // Still nothing: the session ends, with the issue line up.
      await waitFor(
        () => {
          expect(rig.result.current.phase).toBe("closed");
        },
        { timeout: 9000 },
      );
      expect(rig.result.current.issue).toContain("No audio from the microphone");
      expect(rig.engine.released).toBe(1);
    },
    20_000,
  );

  it("a mic whose start throws exits with a retryable issue", async () => {
    const rig = makeRig();
    rig.capture.fails = true;
    await act(async () => {
      await rig.result.current.requestEntry();
    });

    await waitFor(() => {
      expect(rig.result.current.phase).toBe("closed");
    });
    expect(rig.result.current.issue).toContain("Microphone failed");
    expect(rig.engine.released).toBe(1);
  });

  it("dispose (unmount) releases a running session", async () => {
    const rig = makeRig();
    await enterOpen(rig);

    await act(async () => {
      rig.unmount();
    });

    expect(rig.engine.released).toBe(1);
    expect(rig.capture.stopped).toBe(1);
  });
});
