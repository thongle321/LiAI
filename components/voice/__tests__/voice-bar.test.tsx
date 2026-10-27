/** VoiceBar: the rendered contract of the collapsed in-tab session (spec:
 *  voice-tab hands-free parity, issue 04). The full view's suite pins the
 *  phases and gestures; this one pins the bar's own decisions:
 *
 *   - the status title mirrors the full view's (including the muted
 *     override), the subtitle is the swipe-up hint and swaps to the issue,
 *   - the whole body is one expand pressable (tap → expand; the orb-level
 *     interrupt semantics stay on the full view),
 *   - the swipe-up gesture expands at the reference's thresholds,
 *   - mute and End hand off to the controller (no new behavior).
 */

import { fireEvent, render, screen } from "@testing-library/react-native";
import { State } from "react-native-gesture-handler";
import {
  fireGestureHandler,
  getByGestureTestId,
} from "react-native-gesture-handler/jest-utils";

import type { useVoiceMode } from "@/hooks/useVoiceMode.ts";
import { VoiceBar } from "../voice-bar";
import { useVoiceLevels } from "expo-thinking-orbs";

type VoiceModeState = ReturnType<typeof useVoiceMode>;

/** A mic capsule nobody drives: the mocked package hook hands back its
 *  inert shape, typed through the REAL interface — same trick as the
 *  full-view suite. */
const inbox = (): ReturnType<typeof useVoiceLevels> => useVoiceLevels();

const actions = {
  requestEntry: jest.fn(async () => {}),
  dismissSheet: jest.fn(() => {}),
  setupDone: jest.fn(async () => {}),
  continueAnyway: jest.fn(async () => {}),
  openModels: jest.fn(() => {}),
  tapCloud: jest.fn(() => {}),
  toggleMute: jest.fn(() => {}),
  collapse: jest.fn(() => {}),
  expand: jest.fn(() => {}),
  end: jest.fn(async () => {}),
};

function surface(over: Partial<VoiceModeState> = {}): VoiceModeState {
  return {
    phase: "listening",
    micMuted: false,
    presentation: "bar",
    origin: "voice",
    heard: "",
    reply: null,
    issue: null,
    needsMicSettings: false,
    sheet: null,
    ...actions,
    ...over,
  } as VoiceModeState;
}

function renderBar(voice: VoiceModeState): void {
  render(<VoiceBar mic={inbox()} voice={voice} />);
}

describe("VoiceBar status", () => {
  it("the title mirrors the full view's per-phase copy", () => {
    const cases: Array<[VoiceModeState["phase"], string]> = [
      ["starting", "CONNECTING"],
      ["listening", "LISTENING"],
      ["thinking", "THINKING"],
      ["speaking", "SPEAKING"],
    ];
    for (const [phase, title] of cases) {
      const { unmount } = render(
        <VoiceBar mic={inbox()} voice={surface({ phase })} />,
      );

      expect(screen.getByText(title)).toBeOnTheScreen();
      unmount();
    }
  });

  it("a muted listen reads MICROPHONE OFF, like the full view", () => {
    renderBar(surface({ phase: "listening", micMuted: true }));

    expect(screen.getByText("MICROPHONE OFF")).toBeOnTheScreen();
    expect(screen.queryByText("LISTENING")).not.toBeOnTheScreen();
  });

  it("the subtitle is the swipe-up hint by default", () => {
    renderBar(surface({ phase: "listening" }));

    expect(screen.getByText("Swipe up for voice view")).toBeOnTheScreen();
  });

  it("the last issue replaces the subtitle while live", () => {
    renderBar(
      surface({
        phase: "listening",
        issue: "Couldn't play the answer aloud.",
      }),
    );

    expect(
      screen.getByText("Couldn't play the answer aloud."),
    ).toBeOnTheScreen();
    expect(screen.queryByText("Swipe up for voice view")).not.toBeOnTheScreen();
  });
});

describe("VoiceBar expand", () => {
  it("tapping the body hands expand off to the controller", () => {
    renderBar(surface({ phase: "listening" }));

    fireEvent.press(screen.getByTestId("voice-bar-expand"));
    expect(actions.expand).toHaveBeenCalledTimes(1);
  });

  it("a long swipe up expands; a short slow one springs back", () => {
    renderBar(surface({ phase: "listening" }));

    fireGestureHandler(getByGestureTestId("voice-bar-swipe"), [
      { state: State.BEGAN, translationY: 0, velocityY: 0 },
      { state: State.ACTIVE, translationY: -25, velocityY: 0 },
      { state: State.END, translationY: -60, velocityY: 0 },
    ]);
    expect(actions.expand).toHaveBeenCalledTimes(1);

    actions.expand.mockClear();
    fireGestureHandler(getByGestureTestId("voice-bar-swipe"), [
      { state: State.BEGAN, translationY: 0, velocityY: 0 },
      { state: State.ACTIVE, translationY: -10, velocityY: 0 },
      { state: State.END, translationY: -20, velocityY: 0 },
    ]);
    expect(actions.expand).not.toHaveBeenCalled();
  });

  it("a fast upward flick expands however short", () => {
    renderBar(surface({ phase: "listening" }));

    fireGestureHandler(getByGestureTestId("voice-bar-swipe"), [
      { state: State.BEGAN, translationY: 0, velocityY: 0 },
      { state: State.ACTIVE, translationY: -12, velocityY: -1200 },
      { state: State.END, translationY: -25, velocityY: -1200 },
    ]);
    expect(actions.expand).toHaveBeenCalledTimes(1);
  });
});

describe("VoiceBar session controls", () => {
  it("mute hands the toggle off, wired to the same switch contract", () => {
    renderBar(surface({ phase: "listening" }));

    const mute = screen.getByTestId("voice-mute");
    expect(mute.props.accessibilityState.checked).toBe(true);
    fireEvent.press(mute);
    expect(actions.toggleMute).toHaveBeenCalledTimes(1);
  });

  it("End hands the exit off to the controller", async () => {
    renderBar(surface({ phase: "speaking" }));

    fireEvent.press(screen.getByTestId("voice-bar-end"));
    expect(actions.end).toHaveBeenCalledTimes(1);
  });
});
