/** VoiceSetupSheet: the voice tab's first-use setup.
 *
 *  PocketParity (VoiceSetupSheet.tsx), with the recorded divergence: no
 *  "choose a neural voice" step — LiAI's session speaks with whatever the
 *  TTS settings hold, so the sheet is the whisper row + mic note +
 *  Continue (download the setup tier, then ask for the mic). Cancel never
 *  stops a running download.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { VoiceSetupSheet } from "../voice-setup-sheet.tsx";
import { useAsrStore } from "@/store/asr.ts";
import { ensureMicAccess } from "@/services/voice/mic-access.ts";

jest.mock("@/services/voice/mic-access.ts", () => ({
  ensureMicAccess: jest.fn(async () => "granted"),
}));

const ensureMic = jest.requireMock("@/services/voice/mic-access.ts").ensureMicAccess as jest.Mock;

function arm(over: {
  states?: Partial<Record<"base", "ready" | "downloading" | "error" | "not_installed">>;
  tierReady?: boolean;
}): void {
  useAsrStore.setState({
    selectedTier: "small",
    isSelectedTierReady: over.tierReady ?? false,
    downloadStates: {
      base: over.states?.base ?? "not_installed",
      small: "not_installed",
      "large-turbo": "not_installed",
    } as never,
    downloadProgress: { base: 0.3, small: 0, "large-turbo": 0 },
    downloadError: { base: null, small: null, "large-turbo": null },
  } as never);
}

function renderSheet(props: {
  onDone?: () => void;
  onClose?: () => void;
} = {}): void {
  render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <VoiceSetupSheet
        visible
        onDone={props.onDone ?? (() => {})}
        onClose={props.onClose ?? (() => {})}
      />
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  ensureMic.mockResolvedValue?.("granted");
});

afterEach(() => {
  jest.clearAllMocks();
});

describe("VoiceSetupSheet", () => {
  it("shows the setup tier row, mic note, Continue and Cancel", () => {
    arm({});
    renderSheet();

    expect(screen.getByTestId("voice-setup-sheet")).toBeOnTheScreen();
    expect(screen.getByTestId("voice-setup-stt")).toBeOnTheScreen();
    // The divergence: no voice row at all.
    expect(screen.queryByTestId("voice-setup-voice")).toBeNull();
    expect(screen.getByText("We'll ask for microphone access next.")).toBeOnTheScreen();
    expect(screen.getByTestId("voice-setup-continue")).toBeOnTheScreen();
    expect(screen.getByTestId("voice-setup-cancel")).toBeOnTheScreen();
  });

  it("Continue downloads the setup tier, then asks the mic, then reports done", async () => {
    arm({});
    const downloadModel = jest.fn(async () => {
      useAsrStore.setState({ isSelectedTierReady: true });
    });
    useAsrStore.setState({ downloadModel: downloadModel as never });
    const onDone = jest.fn();
    renderSheet({ onDone });

    fireEvent.press(screen.getByTestId("voice-setup-continue"));

    expect(downloadModel).toHaveBeenCalledWith("base");
    await waitFor(() => {
      expect(ensureMic).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(onDone).toHaveBeenCalledTimes(1);
    });
  });

  it("a ready tier skips the download and goes straight to the mic", async () => {
    arm({ tierReady: true });
    const downloadModel = jest.fn(async () => {});
    useAsrStore.setState({ downloadModel: downloadModel as never });
    const onDone = jest.fn();
    renderSheet({ onDone });

    fireEvent.press(screen.getByTestId("voice-setup-continue"));
    await waitFor(() => {
      expect(onDone).toHaveBeenCalledTimes(1);
    });
    expect(downloadModel).not.toHaveBeenCalled();
  });

  it("a running download disables Continue on Downloading…", () => {
    arm({ states: { base: "downloading" } });
    renderSheet();

    const cta = screen.getByTestId("voice-setup-continue");
    expect(cta.props.accessibilityState?.disabled).toBe(true);
    expect(screen.getAllByText("Downloading…").length).toBeGreaterThan(0);
  });

  it("a mic refusal keeps the user in the sheet with the copy", async () => {
    arm({ tierReady: true });
    ensureMic.mockResolvedValue("settings");
    const onDone = jest.fn();
    renderSheet({ onDone });

    fireEvent.press(screen.getByTestId("voice-setup-continue"));
    await waitFor(() => {
      expect(screen.getByText("Voice mode needs microphone access.")).toBeOnTheScreen();
    });
    expect(onDone).not.toHaveBeenCalled();
  });

  it("Cancel closes without touching the tier", () => {
    arm({ states: { base: "downloading" } });
    const onClose = jest.fn();
    renderSheet({ onClose });

    fireEvent.press(screen.getByTestId("voice-setup-cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(useAsrStore.getState().downloadStates.base).toBe("downloading");
  });
});
