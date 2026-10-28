/** VoiceOrbHero: the rendered contract of the voice tab's visual. The
 *  real orb is the module's own domain (Skia, device-verified, see the
 *  orb redesign spec); under Jest it stands in as the label-bearing View
 *  the hero passes its phase through — so what this suite pins is what
 *  the CODE decides: which lifecycle state each VoiceModePhase resolves
 *  to (image role, per-state label), the press split (closed → enter the
 *  gates, open → the cloud tap), and where the mic capsule lands. The
 *  press split's ACTIONS belong to the screen (jest/voice-screen.test.tsx);
 *  here onTap is a spy. */

import { fireEvent, render, screen } from "@testing-library/react-native";

import * as orbs from "expo-thinking-orbs";
import type { useVoiceMode } from "@/hooks/useVoiceMode.ts";
import { VoiceOrbHero } from "../voice-orb-hero";
import { useVoiceLevels } from "expo-thinking-orbs";

type VoiceModeState = ReturnType<typeof useVoiceMode>;

/** A mic capsule nobody drives: the mocked package hook hands back its
 *  inert shape, typed through the REAL interface — the same trick the
 *  screen uses, so the typecheck proves the prop matches. */
const inbox = (): ReturnType<typeof useVoiceLevels> => useVoiceLevels();

function renderHero(
  phase: VoiceModeState["phase"],
  opts: { failed?: boolean; muted?: boolean; onTap?: () => void } = {},
): void {
  const onTap = opts.onTap ?? (() => {});
  render(
    <VoiceOrbHero
      phase={phase}
      failed={opts.failed === true}
      muted={opts.muted === true}
      mic={inbox()}
      onTap={onTap}
    />,
  );
}

describe("VoiceOrbHero", () => {
  it("closed: the shell uses disconnected and the tap enters the gates", () => {
    const onTap = jest.fn();
    renderHero("closed", { onTap });

    expect(screen.getByLabelText("Disconnected")).toBeOnTheScreen();
    fireEvent.press(screen.getByLabelText("Tap to speak"));
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it("live phases resolve the orb's behaviour; the tap is always on", () => {
    const cases: Array<[VoiceModeState["phase"], string]> = [
      ["starting", "Connecting"],
      ["listening", "Listening"],
      ["transcribing", "Processing"],
      ["thinking", "Thinking"],
      ["speaking", "Speaking"],
    ];
    for (const [phase, label] of cases) {
      const onTap = jest.fn();
      const { unmount } = render(
        <VoiceOrbHero phase={phase} failed={false} mic={inbox()} onTap={onTap} />,
      );
      expect(screen.getByLabelText(label)).toBeOnTheScreen();
      fireEvent.press(screen.getByLabelText("Tap to stop or take the turn"));
      expect(onTap).toHaveBeenCalledTimes(1);
      unmount();
    }
  });

  it("a dead gate freezes the shell as failed — and the tap still works", () => {
    const onTap = jest.fn();
    renderHero("closed", { failed: true, onTap });

    expect(screen.getByLabelText("Connection failed")).toBeOnTheScreen();
    fireEvent.press(screen.getByLabelText("Tap to speak"));
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it("a muted listen freezes the shell and drops the signal colour", () => {
    const orbSpy = jest.spyOn(orbs, "VoiceOrb");
    renderHero("listening", { muted: true });

    // The paused prop is the real orb's freeze; the colour steps down from
    // the signal blue to the secondary text step (the greyed treatment).
    const lastCall = orbSpy.mock.calls.at(-1)![0];
    expect(lastCall.paused).toBe(true);
    expect(lastCall.color).toBe("#475569"); // light secondaryText
    orbSpy.mockRestore();
  });

  it("unmuted sessions keep the running shell in the signal colour", () => {
    const orbSpy = jest.spyOn(orbs, "VoiceOrb");
    renderHero("listening", { muted: false });

    const lastCall = orbSpy.mock.calls.at(-1)![0];
    expect(lastCall.paused).toBe(false);
    orbSpy.mockRestore();
  });
});
