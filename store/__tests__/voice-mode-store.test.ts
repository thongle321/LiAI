/** The voice-mode session circuit (store/voice-mode.ts) — the one
 *  observable home for the session's presented state, tested directly
 *  like the ASR store suite.
 *
 *  Covered here: the store's defaults, merge semantics, phase transitions
 *  and reset-on-close. The BEHAVIOR behind the transitions is the
 *  controller's and lives in hooks/__tests__/useVoiceMode.test.tsx —
 *  this suite pins the seam itself: no actions of its own, only the
 *  controller-shaped write lane (`voiceModeSessionApi`), and no module
 *  outside the controller writes the circuit.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  voiceModeSessionApi,
  useVoiceModeSession,
} from "@/store/voice-mode.ts";

const ROOT = join(__dirname, "..", "..");

describe("voice-mode session circuit", () => {
  beforeEach(() => {
    voiceModeSessionApi.reset();
  });

  it("starts closed on every axis", () => {
    const circuit = useVoiceModeSession.getState();
    expect(circuit).toEqual({
      phase: "closed",
      micMuted: false,
      presentation: "full",
      origin: null,
      heard: "",
      reply: null,
      issue: null,
      needsMicSettings: false,
      sheet: null,
    });
  });

  it("merges partial patches — captions ride alongside the phase", () => {
    voiceModeSessionApi.set({ phase: "listening" });
    voiceModeSessionApi.set({ heard: "hello" });

    const circuit = useVoiceModeSession.getState();
    expect(circuit.phase).toBe("listening");
    expect(circuit.heard).toBe("hello");
    expect(circuit.presentation).toBe("full"); // untouched fields survive
  });

  it("carries every phase the controller writes, straight through", () => {
    // The session's arc: start → listen → per-turn loop → close.
    const phases = [
      "starting",
      "listening",
      "transcribing",
      "thinking",
      "speaking",
    ] as const;
    for (const phase of phases) {
      voiceModeSessionApi.set({ phase });
      expect(useVoiceModeSession.getState().phase).toBe(phase);
    }
    voiceModeSessionApi.set({ phase: "closed" });
    expect(useVoiceModeSession.getState().phase).toBe("closed");
  });

  it("reset is the close: mute dies, the bar gives way, gates close", () => {
    voiceModeSessionApi.set({
      phase: "speaking",
      micMuted: true,
      presentation: "bar",
      origin: "chat",
      heard: "half-heard",
      reply: "stale reply",
      issue: "stale issue",
      needsMicSettings: true,
      sheet: { kind: "setup" },
    });

    voiceModeSessionApi.reset();

    expect(useVoiceModeSession.getState()).toEqual({
      phase: "closed",
      micMuted: false,
      presentation: "full",
      origin: null,
      heard: "",
      reply: null,
      issue: null,
      needsMicSettings: false,
      sheet: null,
    });
  });

  it("the write lane is controller-shaped: get/set/reset, no actions", () => {
    // Every member of the seam, nothing else — the store carries no
    // toggle/enter/exit of its own, so no screen can drive the machine.
    expect(Object.keys(voiceModeSessionApi).sort()).toEqual([
      "get",
      "reset",
      "set",
    ]);
  });

  it("only the controller module imports the write lane", () => {
    // Same walk as jest/architecture-conventions.test.ts, one assertion:
    // `voiceModeSessionApi` (the write lane) is reachable only from the
    // controller hook and the store module itself. Screens read through
    // `useVoiceModeSession` / `useVoiceSession`, never through the api.
    const dirs = ["app", "components", "services", "utils", "store", "hooks"];
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory() && name !== "__tests__") walk(full, out);
        else out.push(full);
      }
      return out;
    };
    const offenders = dirs
      .filter((dir) => existsSync(join(ROOT, dir)))
      .flatMap((dir) => walk(join(ROOT, dir)))
      .filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes(".test."))
      .map((f) => f.slice(ROOT.length + 1).split("\\").join("/"))
      .filter((rel) => rel !== "hooks/useVoiceMode.ts" && rel !== "store/voice-mode.ts")
      .filter((rel) => {
        const source = readFileSync(join(ROOT, rel), "utf8");
        return (
          /store\/voice-mode\.ts/.test(source) &&
          /voiceModeSessionApi/.test(source)
        );
      });
    expect(offenders).toEqual([]);
  });
});
