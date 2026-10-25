/** MicButton: the composer's self-gating mic.
 *
 *  PocketParity (MicButton.tsx), LiAI shape: the ready mic starts a
 *  capture via `onStart`; the not-ready mic OPENS MicSetupSheet IN PLACE
 *  (keyboard dismissed first) instead of navigating to /voice-settings;
 *  the gate-closed mic renders nothing. Pressing Cancel or a download
 *  finishing while the sheet is open both retire the sheet in place.
 */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Keyboard } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { MicButton } from "../mic-button.tsx";
import { useAsrStore } from "@/store/asr.ts";

jest.mock("react-native-keyboard-controller", () => ({
  KeyboardControllerNative: { dismiss: jest.fn() },
}));

function arm(over: {
  asrAvailable?: boolean;
  tierReady?: boolean;
  state?: "ready" | "downloading" | "error" | "not_installed";
}): void {
  useAsrStore.setState({
    asrAvailable: over.asrAvailable ?? true,
    selectedTier: "small",
    isSelectedTierReady: over.tierReady ?? false,
    downloadStates: {
      base: over.state ?? "not_installed",
      small: "not_installed",
      "large-turbo": "not_installed",
    } as never,
    downloadError: { base: null, small: null, "large-turbo": null },
  } as never);
}

function renderMic(onStart: () => void = () => {}): void {
  render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <MicButton onStart={onStart} />
    </SafeAreaProvider>,
  );
}

describe("MicButton", () => {
  beforeEach(() => {
    jest.spyOn(Keyboard, "dismiss").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it("a gated voice input renders nothing", () => {
    arm({ asrAvailable: false });
    renderMic();

    expect(screen.queryByTestId("mic-button")).toBeNull();
    expect(screen.queryByTestId("mic-button-setup")).toBeNull();
  });

  it("a ready tier mic starts the capture", () => {
    arm({ tierReady: true });
    const onStart = jest.fn();
    renderMic(onStart);

    expect(screen.getByTestId("mic-button")).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId("mic-button"));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("a not-ready mic opens the setup sheet in place, keyboard gone", () => {
    arm({});
    renderMic();

    expect(screen.getByTestId("mic-button-setup")).toBeOnTheScreen();
    expect(screen.queryByTestId("mic-button")).toBeNull();
    fireEvent.press(screen.getByTestId("mic-button-setup"));

    expect(Keyboard.dismiss).toHaveBeenCalled();
    expect(screen.getByTestId("mic-setup-sheet")).toBeOnTheScreen();
    expect(screen.getByTestId("mic-setup-download")).toBeOnTheScreen();
  });

  it("a download completing while the sheet is open retires it in place", async () => {
    arm({});
    renderMic();
    fireEvent.press(screen.getByTestId("mic-button-setup"));
    expect(screen.getByTestId("mic-setup-sheet")).toBeOnTheScreen();

    act(() => {
      useAsrStore.setState({
        downloadStates: {
          base: "ready",
          small: "not_installed",
          "large-turbo": "not_installed",
        } as never,
        isSelectedTierReady: true,
      });
    });

    await waitFor(() => {
      expect(screen.queryByTestId("mic-setup-sheet")).toBeNull();
    });
    // And the mic is now a recorder.
    expect(screen.getByTestId("mic-button")).toBeOnTheScreen();
  });

  it("Cancel retires the sheet without changing the download", async () => {
    arm({});
    renderMic();
    fireEvent.press(screen.getByTestId("mic-button-setup"));

    fireEvent.press(screen.getByTestId("mic-setup-cancel"));

    await waitFor(() => {
      expect(screen.queryByTestId("mic-setup-sheet")).toBeNull();
    });
    expect(
      useAsrStore.getState().downloadStates.base,
    ).toBe("not_installed");
    // Still not ready: the mic stays the setup one.
    expect(screen.getByTestId("mic-button-setup")).toBeOnTheScreen();
  });
});
