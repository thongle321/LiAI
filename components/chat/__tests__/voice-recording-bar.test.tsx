/** VoiceRecordingBar (D1/D2/D3/D10): cancel/stop affordances, the level
 *  waveform with its timer, the transcribing + waiting labels, and the
 *  language chip that resets to auto-detect. Drives the app singleton —
 *  the component subscribes to it, so throwaway store instances would
 *  only test each other. */

import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { useAsrStore } from "@/store/asr.ts";
import { VoiceRecordingBar, BAR_MIN_HEIGHT, BAR_RANGE } from "../voice-recording-bar.tsx";

const onCancel = jest.fn();
const onStop = jest.fn();

function setup() {
  render(<VoiceRecordingBar onCancel={onCancel} onStop={onStop} />);
}

function setAsrState(partial: Partial<ReturnType<typeof useAsrStore.getState>>): void {
  act(() => {
    useAsrStore.setState(partial);
  });
}

describe("VoiceRecordingBar", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setAsrState({
      captureState: "idle",
      recordingStartedAt: null,
      inputLevels: [],
      spokenLanguage: null,
      waitingForChat: false,
      error: null,
    });
  });

  it("while recording: cancel + stop + bars + elapsed timer", () => {
    setAsrState({ captureState: "recording", recordingStartedAt: Date.now() });
    setup();
    expect(screen.queryByTestId("voice-cancel-button")).toBeTruthy();
    expect(screen.queryByTestId("voice-stop-button")).toBeTruthy();
    expect(screen.queryByTestId("voice-level-bars")).toBeTruthy();
    expect(screen.getByTestId("voice-elapsed")).toBeTruthy();
    expect(screen.queryByTestId("voice-transcribing")).toBeNull();

    fireEvent.press(screen.getByTestId("voice-cancel-button"));
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByTestId("voice-stop-button"));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("bar geometry rides the ladder (min + level × range)", () => {
    expect(BAR_MIN_HEIGHT).toBe(3);
    expect(BAR_RANGE).toBe(21); // 24 max − 3 min
  });

  it("while transcribing: label replaces the waveform, spinner replaces stop", () => {
    setAsrState({ captureState: "transcribing", waitingForChat: false });
    setup();
    expect(screen.queryByTestId("voice-cancel-button")).toBeTruthy();
    expect(screen.queryByTestId("voice-level-bars")).toBeNull();
    expect(screen.getByTestId("voice-transcribing")).toHaveTextContent(
      "Transcribing…",
    );
    // The stop affordance is a SPINNER, not a button (PocketParity).
    expect(screen.queryByTestId("voice-stop-button")).toBeNull();
  });

  it("the waiting-for-chat variant says so", () => {
    setAsrState({ captureState: "transcribing", waitingForChat: true });
    setup();
    expect(screen.getByTestId("voice-transcribing")).toHaveTextContent(
      "Transcribing after the reply finishes…",
    );
  });

  it("the language chip: auto when unset, tappable reset when set", () => {
    setAsrState({ captureState: "recording", spokenLanguage: null });
    setup();
    expect(screen.getByTestId("voice-language")).toHaveTextContent(
      "Language: auto",
    );
    expect(screen.queryByTestId("voice-language-reset")).toBeNull();

    setAsrState({ spokenLanguage: "en" });
    expect(screen.getByTestId("voice-language")).toHaveTextContent(
      "Language: EN (tap to reset)",
    );
    fireEvent.press(screen.getByTestId("voice-language-reset"));
    expect(useAsrStore.getState().spokenLanguage).toBeNull();
  });
});
