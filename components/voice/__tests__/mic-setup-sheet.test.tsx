/** MicSetupSheet: the composer's in-place Whisper download.
 *
 *  PocketParity (MicSetupSheet.tsx): the setup tier row + one primary
 *  button whose label/behavior IS the download state (install → disabled
 *  downloading → retry), a Cancel that closes WITHOUT stopping a running
 *  download, and an onClosed callback the owner unfreebes on. The tier
 *  offered is the store's `setupTier` (default base when nothing ready).
 */

import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { MicSetupSheet } from "../mic-setup-sheet.tsx";
import { useAsrStore } from "@/store/asr.ts";

function arm(over: {
  states?: Partial<Record<"base", "ready" | "downloading" | "error" | "not_installed">>;
  error?: string | null;
}): void {
  useAsrStore.setState({
    selectedTier: "small",
    isSelectedTierReady: false,
    downloadStates: {
      base: over.states?.base ?? "not_installed",
      small: "not_installed",
      "large-turbo": "not_installed",
    } as never,
    downloadProgress: { base: 0.4, small: 0, "large-turbo": 0 },
    downloadError: { base: over.error ?? null, small: null, "large-turbo": null },
  } as never);
}

function renderSheet(onClosed: () => void = () => {}): void {
  render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <MicSetupSheet visible onClosed={onClosed} />
    </SafeAreaProvider>,
  );
}

describe("MicSetupSheet", () => {
  it("offers the setup tier with a Download button wired to the store", () => {
    arm({});
    const downloadModel = jest.fn(async () => {});
    useAsrStore.setState({ downloadModel: downloadModel as never });
    renderSheet();

    expect(screen.getByTestId("mic-setup-sheet")).toBeOnTheScreen();
    expect(screen.getByTestId("mic-setup-stt")).toBeOnTheScreen();
    expect(screen.getByText("One quick download, then you can dictate offline.")).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId("mic-setup-download"));
    expect(downloadModel).toHaveBeenCalledWith("base");
  });

  it("a running download disables the button on Downloading…", () => {
    arm({ states: { base: "downloading" } });
    const downloadModel = jest.fn(async () => {});
    useAsrStore.setState({ downloadModel: downloadModel as never });
    renderSheet();

    const cta = screen.getByTestId("mic-setup-download");
    expect(cta.props.accessibilityState?.disabled).toBe(true);
    expect(screen.getByText("Downloading…")).toBeOnTheScreen();
    fireEvent.press(cta);
    expect(downloadModel).not.toHaveBeenCalled();
  });

  it("a failed download offers Retry wired to retryDownload", () => {
    arm({ states: { base: "error" }, error: "asr::network" });
    const retryDownload = jest.fn(async () => {});
    useAsrStore.setState({ retryDownload: retryDownload as never });
    renderSheet();

    expect(screen.getByText("Retry")).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId("mic-setup-download"));
    expect(retryDownload).toHaveBeenCalledWith("base");
  });

  it("Cancel closes without stopping a running download", () => {
    arm({ states: { base: "downloading" } });
    const onClosed = jest.fn();
    renderSheet(onClosed);

    fireEvent.press(screen.getByTestId("mic-setup-cancel"));
    expect(onClosed).toHaveBeenCalledTimes(1);
    // The in-flight download is untouched: its state row is unchanged.
    expect(useAsrStore.getState().downloadStates.base).toBe("downloading");
  });
});
