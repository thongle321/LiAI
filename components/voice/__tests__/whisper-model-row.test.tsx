/** WhisperModelRow: a tier's identity + download state, the one row both
 *  setup sheets render. The contracts pinned here (PocketPal
 *  WhisperModelRow.tsx): a ready tier says "Installed", a downloading one
 *  shows the transfer progress ("X of Y" + a bar), a failed one explains
 *  WHY — low disk gets the storage line, everything else gets the plain
 *  failure line.
 */

import { render, screen } from "@testing-library/react-native";

import { WhisperModelRow } from "../whisper-model-row.tsx";
import { ASR_TIERS } from "@/services/asr/constants.ts";
import { ASR_INSUFFICIENT_STORAGE } from "@/services/asr/constants.ts";
import { formatBytes } from "@/services/models/progress.ts";
import { useAsrStore } from "@/store/asr.ts";

const BASE_BYTES = ASR_TIERS.base.estimatedBytes;

function seed(over: {
  states?: Partial<Record<"base", string>>;
  progress?: number;
  error?: string | null;
  freeDisk?: number | null;
}): void {
  useAsrStore.setState({
    downloadStates: {
      base: over.states?.base ?? "not_installed",
      small: "not_installed",
      "large-turbo": "not_installed",
    } as never,
    downloadProgress: { base: over.progress ?? 0, small: 0, "large-turbo": 0 },
    downloadError: { base: over.error ?? null, small: null, "large-turbo": null },
    freeDiskBytes: over.freeDisk ?? null,
  });
}

describe("WhisperModelRow", () => {
  it("names the tier and its size, with no error lines when idle", () => {
    seed({});
    render(<WhisperModelRow tier="base" testIDPrefix="mic-setup" />);

    expect(screen.getByText("Speech recognition")).toBeOnTheScreen();
    expect(
      screen.getByText(`Whisper Base · ${formatBytes(BASE_BYTES, 0)}`),
    ).toBeOnTheScreen();
    expect(screen.queryByText("Installed")).toBeNull();
    expect(
      screen.queryByTestId("mic-setup-low-disk"),
    ).toBeNull();
  });

  it("a ready tier reads Installed", () => {
    seed({ states: { base: "ready" } });
    render(<WhisperModelRow tier="base" testIDPrefix="mic-setup" />);

    expect(screen.getByText("Installed")).toBeOnTheScreen();
  });

  it("a downloading tier shows the transfer (done of total) and a bar", () => {
    seed({ states: { base: "downloading" }, progress: 0.5 });
    render(<WhisperModelRow tier="base" testIDPrefix="mic-setup" />);

    expect(
      screen.getByText(
        `${formatBytes(BASE_BYTES * 0.5, 0)} of ${formatBytes(BASE_BYTES, 0)}`,
      ),
    ).toBeOnTheScreen();
    expect(screen.getByTestId("mic-setup-stt-progress")).toBeOnTheScreen();
  });

  it("a failed download with disk room left shows the storage line", () => {
    seed({
      states: { base: "error" },
      error: ASR_INSUFFICIENT_STORAGE,
      freeDisk: 100 * 1000 * 1000,
    });
    render(<WhisperModelRow tier="base" testIDPrefix="mic-setup" />);

    expect(screen.getByTestId("mic-setup-low-disk")).toBeOnTheScreen();
    expect(screen.getByText(/Not enough space/i)).toBeOnTheScreen();
  });

  it("a failed download without the storage code shows the plain failure", () => {
    seed({ states: { base: "error" }, error: "asr::network" });
    render(<WhisperModelRow tier="base" testIDPrefix="mic-setup" />);

    expect(screen.getByText("Download failed. Try again.")).toBeOnTheScreen();
    expect(screen.queryByTestId("mic-setup-low-disk")).toBeNull();
  });
});
