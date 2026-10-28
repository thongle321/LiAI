/** VoiceFullView: the rendered contract of the shared full-screen voice
 *  view (spec: hands-free in chat, issue 02). The Voice tab's session
 *  screen is store-driven through this component; the real orb is the
 *  module's own domain, so under Jest it stands in as the labelled View
 *  the hero passes its phase through — the same stand-in the hero suite
 *  pins. What this suite covers:
 *
 *   - status title + hint per phase (and the error-variant override slot
 *     for the last issue),
 *   - the orb's phase mapping (via the VoiceOrb behaviour label) and the
 *     tap-orb dispatch per phase (closed → requestEntry, live →
 *     tapCloud, whose per-phase split is the controller's job),
 *   - the reserved mute + drag-handle slots (rendered, nothing visible).
 */

import { fireEvent, render, screen } from "@testing-library/react-native";
import { BackHandler } from "react-native";
import { State } from "react-native-gesture-handler";
import {
  fireGestureHandler,
  getByGestureTestId,
} from "react-native-gesture-handler/jest-utils";
import { openSettings, } from "expo-linking";

import type { useVoiceMode } from "@/hooks/useVoiceMode.ts";
import type { VoiceModeSheet } from "@/hooks/useVoiceMode.ts";
import { VoiceFullView } from "../voice-full-view";
import { useVoiceLevels } from "expo-thinking-orbs";

type VoiceModeState = ReturnType<typeof useVoiceMode>;

/** A mic capsule nobody drives: the mocked package hook hands back its
 *  inert shape, typed through the REAL interface — the same trick the
 *  screen uses, so the typecheck proves the prop matches. */
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

function surface(
  over: Partial<VoiceModeState> = {},
): VoiceModeState {
  return {
    phase: "closed",
    micMuted: false,
    presentation: "full",
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

function renderView(voice: VoiceModeState): void {
  render(<VoiceFullView mic={inbox()} voice={voice} />);
}

describe("VoiceFullView status strings", () => {
  it("title and hint per phase: starting/listening/thinking/speaking", () => {
    const cases: Array<[VoiceModeState["phase"], string, string]> = [
      ["starting", "CONNECTING", "Connecting"],
      ["listening", "LISTENING", "Listening"],
      ["thinking", "THINKING", "Thinking"],
      ["speaking", "SPEAKING", "Speaking"],
    ];
    for (const [phase, title, hint] of cases) {
      const { unmount } = render(<VoiceFullView mic={inbox()} voice={surface({ phase })} />);

      expect(screen.getByText(title)).toBeOnTheScreen();
      expect(screen.getByText(hint)).toBeOnTheScreen();
      unmount();
    }
  });

  it("the title is announced to screen readers as the phase changes", () => {
    render(<VoiceFullView mic={inbox()} voice={surface({ phase: "listening" })} />);

    expect(screen.getByText("LISTENING").props.accessibilityLiveRegion).toBe(
      "polite",
    );
  });
});

describe("VoiceFullView error-variant slot", () => {
  it("the last issue reads as dead text while the session is live", () => {
    renderView(
      surface({ phase: "listening", issue: "Didn't catch anything — try speaking again." }),
    );

    expect(
      screen.getByText("Didn't catch anything — try speaking again."),
    ).toBeOnTheScreen();
    expect(screen.queryByText("Try again")).not.toBeOnTheScreen();
  });

  it("a dead gate adds Try again; a blocked mic becomes the Settings link", () => {
    renderView(surface({ issue: "Microphone is blocked — enable it in Settings." }));
    fireEvent.press(screen.getByLabelText("Try again"));
    expect(actions.requestEntry).toHaveBeenCalledTimes(1);

    renderView(
      surface({ issue: "Microphone is blocked — enable it in Settings.", needsMicSettings: true }),
    );
    fireEvent.press(
      screen.getByText("Microphone is blocked — enable it in Settings."),
    );
    expect(openSettings).toHaveBeenCalledTimes(1);
  });
});

describe("VoiceFullView orb phase mapping + tap dispatch", () => {
  const cases: Array<[VoiceModeState["phase"], string]> = [
    ["starting", "Connecting"],
    ["listening", "Listening"],
    ["transcribing", "Processing"],
    ["thinking", "Thinking"],
    ["speaking", "Speaking"],
  ];

  it("live phases map the orb's behaviour; the tap is the cloud tap", () => {
    for (const [phase, orbLabel] of cases) {
      actions.tapCloud.mockClear();
      const { unmount } = render(
        <VoiceFullView mic={inbox()} voice={surface({ phase })} />,
      );

      expect(screen.getByLabelText(orbLabel)).toBeOnTheScreen();
      fireEvent.press(screen.getByLabelText("Tap to stop or take the turn"));
      expect(actions.tapCloud).toHaveBeenCalledTimes(1);
      expect(actions.requestEntry).not.toHaveBeenCalled();
      unmount();
    }
  });

  it("closed: the disconnected shell enters the gates", () => {
    renderView(surface({ phase: "closed" }));

    expect(screen.getByLabelText("Disconnected")).toBeOnTheScreen();
    fireEvent.press(screen.getByLabelText("Tap to speak"));
    expect(actions.requestEntry).toHaveBeenCalledTimes(1);
    expect(actions.tapCloud).not.toHaveBeenCalled();
  });

  it("an issue with no live session freezes the shell as failed", () => {
    renderView(surface({ issue: "Load a chat model first — pick one in Models." }));

    expect(screen.getByLabelText("Connection failed")).toBeOnTheScreen();
  });
});

describe("VoiceFullView collapse (issue 04)", () => {
  const pull = (translationY: number, velocityY = 0) =>
    fireGestureHandler(getByGestureTestId("voice-view-pull"), [
      { state: State.BEGAN, translationY: 0, velocityY: 0 },
      { state: State.ACTIVE, translationY: translationY / 2, velocityY },
      { state: State.END, translationY, velocityY },
    ]);

  it("the handle row is live in a session: tapping it collapses", () => {
    renderView(surface({ phase: "listening" }));

    expect(screen.getByLabelText("Collapse voice view")).toBeOnTheScreen();
    fireEvent.press(screen.getByLabelText("Collapse voice view"));
    expect(actions.collapse).toHaveBeenCalledTimes(1);
  });

  it("the gate is closed: nothing collapses", () => {
    renderView(surface({ phase: "closed" }));

    expect(screen.queryByLabelText("Collapse voice view")).not.toBeOnTheScreen();
  });

  it("a long pull collapses; a short slow pull spring back", () => {
    renderView(surface({ phase: "listening" }));

    pull(120);
    expect(actions.collapse).toHaveBeenCalledTimes(1);

    actions.collapse.mockClear();
    pull(30, 100);
    expect(actions.collapse).not.toHaveBeenCalled();
  });

  it("a quick flick collapses however short", () => {
    renderView(surface({ phase: "listening" }));

    pull(30, 1200);
    expect(actions.collapse).toHaveBeenCalledTimes(1);
  });

  it("Android back collapses the view", () => {
    const addListener = jest.spyOn(BackHandler, "addEventListener");
    renderView(surface({ phase: "listening" }));

    const add = addListener.mock.calls.at(-1)!;
    expect(add[0]).toBe("hardwareBackPress");
    const handler = add[1] as () => boolean;
    expect(handler()).toBe(true);
    expect(actions.collapse).toHaveBeenCalledTimes(1);
    addListener.mockRestore();
  });
});

describe("VoiceFullView sheets", () => {
  it("respects the sheet contract: a parked gate sheet stays with the screen", () => {
    renderView(
      surface({ sheet: { kind: "setup" } as VoiceModeSheet }),
    );
    // The view itself renders no sheet chrome — the sheets stay with the
    // screen's own pre-entry gates.
    expect(screen.queryByText("Set up voice mode")).not.toBeOnTheScreen();
  });
});

describe("VoiceFullView reserved slots", () => {
  it("the mute control is live in a session and hands its toggle off", () => {
    renderView(surface({ phase: "listening" }));

    const mute = screen.getByTestId("voice-mute");
    expect(mute.props.accessibilityState.checked).toBe(true);
    fireEvent.press(mute);
    expect(actions.toggleMute).toHaveBeenCalledTimes(1);
  });

  it("the mute slots stay out of the closed gate", () => {
    renderView(surface({ phase: "closed" }));

    expect(screen.queryByTestId("voice-mute")).not.toBeOnTheScreen();
  });

  it("a muted listen reads Microphone off, not Listening", () => {
    renderView(
      surface({ phase: "listening", micMuted: true }),
    );

    expect(screen.getByText("MICROPHONE OFF")).toBeOnTheScreen();
    expect(
      screen.getByText("Tap the microphone to talk again"),
    ).toBeOnTheScreen();
    expect(screen.queryByText("LISTENING")).not.toBeOnTheScreen();
    expect(screen.getByTestId("voice-mute").props.accessibilityState)
      .toEqual({ checked: false });
  });
});
