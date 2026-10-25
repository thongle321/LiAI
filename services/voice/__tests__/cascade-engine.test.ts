/** CascadeVoiceEngine contract (ported decision points from pocketpal-ai's
 *  cascadeEngine tests): tier threading in/out, turn outcomes, and the
 *  interrupt semantics on both sides of the send. */

import { energyVad, int16PcmToFloat32 } from "@/services/asr/index.ts";
import { whisperAsrEngine } from "@/services/asr/index.ts";
import { asrStore, useAsrStore } from "@/store/asr.ts";
import { useVoice } from "@/store/voice.ts";

import { CascadeVoiceEngine } from "@/services/voice/cascade-engine.ts";
import type { VoiceTurnPort } from "@/services/voice/types.ts";

/** 400 ms of voiced square-wave PCM: enough to clear the VAD floor. */
function voicedPcm(ms = 400): Uint8Array {
  const samples = (16_000 * ms) / 1000;
  const pcm = new Uint8Array(samples * 2);
  const view = new DataView(pcm.buffer);
  for (let i = 0; i < samples; i++) {
    view.setInt16(
      i * 2,
      (i % 2 ? 1 : -1) * 0.1 * 0x7fff,
      true,
    );
  }
  return pcm;
}
const silence = (): Uint8Array => new Uint8Array(16_000 * 0.4 * 2);

class FakePort implements VoiceTurnPort {
  sent: Array<[string, (id: string) => void]> = [];
  sendResolve: ((ok: true) => void) | null = null;
  sendReject: ((err: unknown) => void) | null = null;
  stops = 0;

  send(text: string, onTurnCreated: (id: string) => void): Promise<void> {
    this.sent.push([text, onTurnCreated]);
    return new Promise((resolve, reject) => {
      this.sendResolve = () => {
        onTurnCreated("turn-1");
        resolve();
      };
      this.sendReject = reject;
    });
  }

  stop(): void {
    this.stops += 1;
  }

  completeSend(): void {
    this.sendResolve?.(true);
  }

  failSend(err: unknown): void {
    this.sendReject?.(err);
  }
}

beforeEach(() => {
  useAsrStore.setState({ chatBusyOnCpu: false, spokenLanguage: null });
  useVoice.setState({ playbackState: { mode: "idle" } });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("CascadeVoiceEngine", () => {
  it("the voice fixture clears the VAD (guards every turn test)", () => {
    expect(energyVad(int16PcmToFloat32(voicedPcm())).passed).toBe(true);
  });

  it("prepare loads the tier on the whisper engine; release clears it", async () => {
    const engine = new CascadeVoiceEngine();
    const preload = jest
      .spyOn(whisperAsrEngine, "preload")
      .mockResolvedValue(undefined);
    const release = jest
      .spyOn(whisperAsrEngine, "release")
      .mockResolvedValue(undefined);

    await engine.prepare("small");
    expect(preload).toHaveBeenCalledWith("small");

    await engine.release();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("a turn before prepare fails as transcribe_failed without decoding", async () => {
    const engine = new CascadeVoiceEngine();
    const transcribe = jest
      .spyOn(whisperAsrEngine, "transcribe")
      .mockResolvedValue({ text: "", language: "en" });
    const port = new FakePort();

    const outcome = await engine.runTurn(
      voicedPcm(),
      port,
      { transcribed: () => {}, speechStarted: () => {} },
    ).done;

    expect(outcome).toBe("transcribe_failed");
    expect(transcribe).not.toHaveBeenCalled();
    expect(port.sent).toHaveLength(0);
  });

  it("sends the transcript and answers; transcribe carries the tier + language", async () => {
    const engine = new CascadeVoiceEngine();
    jest.spyOn(whisperAsrEngine, "preload").mockResolvedValue(undefined);
    const transcribe = jest
      .spyOn(whisperAsrEngine, "transcribe")
      .mockResolvedValue({ text: " hello there ", language: "en" });
    await engine.prepare("base");
    useAsrStore.setState({ spokenLanguage: "en" });

    const seen: string[] = [];
    const port = new FakePort();
    const turn = engine.runTurn(voicedPcm(), port, {
      transcribed: (t) => seen.push(t),
      speechStarted: () => {},
    });
    await new Promise((r) => setTimeout(r, 0));
    port.completeSend();
    const outcome = await turn.done;

    expect(transcribe).toHaveBeenCalledWith(expect.any(String), {
      tier: "base",
      language: "en",
    });
    expect(seen).toEqual(["hello there"]); // TRIMMED for the spoken turn
    expect(port.sent).toEqual([["hello there", expect.any(Function)]]);
    expect(outcome).toBe("answered");
  });

  it("silence is an empty turn; no decode, no send", async () => {
    const engine = new CascadeVoiceEngine();
    await engine.prepare("base");
    jest
      .spyOn(whisperAsrEngine, "transcribe")
      .mockResolvedValue({ text: "", language: "en" });
    const port = new FakePort();

    const outcome = await engine
      .runTurn(silence(), port, { transcribed: () => {}, speechStarted: () => {} })
      .done;

    expect(outcome).toBe("empty");
  });

  it("a blank transcript is an empty turn too", async () => {
    const engine = new CascadeVoiceEngine();
    await engine.prepare("base");
    jest
      .spyOn(whisperAsrEngine, "transcribe")
      .mockResolvedValue({ text: "   ", language: "en" });
    const port = new FakePort();

    const outcome = await engine
      .runTurn(voicedPcm(), port, { transcribed: () => {}, speechStarted: () => {} })
      .done;

    expect(outcome).toBe("empty");
  });

  it("a rejected send is a reply_failed", async () => {
    const engine = new CascadeVoiceEngine();
    await engine.prepare("base");
    jest
      .spyOn(whisperAsrEngine, "transcribe")
      .mockResolvedValue({ text: "hi", language: "en" });
    const port = new FakePort();

    const turn = engine.runTurn(voicedPcm(), port, {
      transcribed: () => {},
      speechStarted: () => {},
    });
    await new Promise((r) => setTimeout(r, 0));
    port.failSend(new Error("no session"));
    const outcome = await turn.done;

    expect(outcome).toBe("reply_failed");
  });

  it("interrupting before the send cancels the transcription", async () => {
    let cancel!: (value: { text: string; language: string }) => void;
    const engine = new CascadeVoiceEngine();
    jest.spyOn(whisperAsrEngine, "preload").mockResolvedValue(undefined);
    jest
      .spyOn(whisperAsrEngine, "transcribe")
      .mockReturnValue(
        new Promise((resolve) => {
          cancel = resolve;
        }),
      );
    const cancelTranscription = jest
      .spyOn(whisperAsrEngine, "cancelTranscription")
      .mockResolvedValue(undefined);
    await engine.prepare("base");
    useVoice.setState({ playbackState: { mode: "playing" } });

    const port = new FakePort();
    const turn = engine.runTurn(voicedPcm(), port, {
      transcribed: () => {},
      speechStarted: () => {},
    });
    await new Promise((r) => setTimeout(r, 0));
    await turn.interrupt();
    cancel({ text: "late", language: "en" });
    const outcome = await turn.done;

    expect(cancelTranscription).toHaveBeenCalledTimes(1);
    expect(port.sent).toHaveLength(0);
    expect(port.stops).toBe(0); // nothing to stop yet
    expect(outcome).toBe("interrupted");
  });

  it("interrupting during the send stops the speech and the run", async () => {
    const engine = new CascadeVoiceEngine();
    jest.spyOn(whisperAsrEngine, "preload").mockResolvedValue(undefined);
    jest
      .spyOn(whisperAsrEngine, "transcribe")
      .mockResolvedValue({ text: "hi", language: "en" });
    jest.spyOn(whisperAsrEngine, "cancelTranscription").mockResolvedValue(undefined);
    await engine.prepare("base");
    useVoice.setState({ playbackState: { mode: "playing" } });

    const port = new FakePort();
    const turn = engine.runTurn(voicedPcm(), port, {
      transcribed: () => {},
      speechStarted: () => {},
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(port.sent).toHaveLength(1);

    const interrupted = turn.interrupt();
    port.completeSend();
    const outcome = await turn.done;
    await interrupted;

    expect(port.stops).toBe(1);
    expect(outcome).toBe("interrupted");
  });

  it("waits the CPU busy gate before decoding, then transcribes", async () => {
    const engine = new CascadeVoiceEngine();
    jest.spyOn(whisperAsrEngine, "preload").mockResolvedValue(undefined);
    const transcribe = jest
      .spyOn(whisperAsrEngine, "transcribe")
      .mockResolvedValue({ text: "hi", language: "en" });
    await engine.prepare("base");
    useAsrStore.setState({ chatBusyOnCpu: true });

    const port = new FakePort();
    const turn = engine.runTurn(voicedPcm(), port, {
      transcribed: () => {},
      speechStarted: () => {},
    });
    await new Promise((r) => setTimeout(r, 150));
    expect(transcribe).not.toHaveBeenCalled(); // still waiting

    useAsrStore.setState({ chatBusyOnCpu: false });
    await new Promise((r) => setTimeout(r, 150));
    expect(transcribe).toHaveBeenCalledTimes(1);
    port.completeSend();
    await turn.done;
    expect(asrStore.waitingForChat).toBe(false);
  });
});
