/** VoiceMemorySheet: the pre-entry memory breakdown.
 *
 *  PocketParity (VoiceMemorySheet.tsx), divergences recorded: no tts row
 *  (LiAI has no measured engine RAM — the fit story is chat + whisper),
 *  and "Choose a smaller model" routes to LiAI's Models screen. Pinned
 *  here: the title splits on wont_fit, the bar proportions the rows, the
 *  Needed line sums to `neededBytes of availableBytes available`,
 *  Continue only when NOT wont_fit (LiAI's fit can only ever be
 *  fits/tight here — continueAnyway stays inert for wont_fit), and Cancel
 *  is always the other way out.
 */

import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactTestInstance } from "react-test-renderer";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { VoiceMemorySheet } from "../voice-memory-sheet.tsx";
import type { VoiceMemoryFit } from "@/services/voice/memory-fit.ts";
import { formatBytes } from "@/services/models/progress.ts";

function fit(status: "tight" | "wont_fit"): VoiceMemoryFit {
  return {
    status,
    sttTier: "base",
    breakdown: {
      rows:
        status === "tight"
          ? [
              { kind: "chat", bytes: 1_000_000_000 },
              { kind: "stt", bytes: 226_047_904 },
            ]
          : [
              { kind: "chat", bytes: 3_000_000_000 },
              { kind: "stt", bytes: 226_047_904 },
            ],
      neededBytes: status === "tight" ? 1_226_047_904 : 3_226_047_904,
      availableBytes: 2_000_000_000,
    },
  };
}

function renderSheet(props: {
  fit: VoiceMemoryFit;
  onContinue?: () => void;
  onPickSmaller?: () => void;
  onClose?: () => void;
}): void {
  render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <VoiceMemorySheet
        fit={props.fit}
        chatModelName="Qwen 1.5B"
        onContinue={props.onContinue ?? (() => {})}
        onChooseSmallerModel={props.onPickSmaller ?? (() => {})}
        onClose={props.onClose ?? (() => {})}
      />
    </SafeAreaProvider>,
  );
}

describe("VoiceMemorySheet", () => {
  it("a tight fit: rows needled with kinds, bar and Needed line", () => {
    renderSheet({ fit: fit("tight") });

    expect(screen.getByTestId("voice-memory-sheet")).toBeOnTheScreen();
    expect(screen.getByText("Memory is tight")).toBeOnTheScreen();
    expect(screen.getByTestId("voice-memory-chat")).toBeOnTheScreen();
    expect(screen.getByText("Chat model · Qwen 1.5B")).toBeOnTheScreen();
    expect(screen.getByText("Speech recognition · Whisper Base")).toBeOnTheScreen();
    expect(screen.getByText("Needed")).toBeOnTheScreen();
    expect(
      screen.getByText(
        `${formatBytes(1_226_047_904, 1)} of ${formatBytes(2_000_000_000, 1)} available`,
      ),
    ).toBeOnTheScreen();
  });

  it("Continue anyway proceeds; Close is the other way out", () => {
    const onContinue = jest.fn();
    const onClose = jest.fn();
    renderSheet({ fit: fit("tight"), onContinue, onClose });

    expect(screen.getByTestId("voice-memory-continue")).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId("voice-memory-continue"));
    expect(onContinue).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByTestId("voice-memory-smaller-model"));
    // A tight fit still offers the smaller-model route.
    expect(screen.getByTestId("voice-memory-smaller-model")).toBeOnTheScreen();
  });

  it("a wont-fit fit: refusal copy, no Continue", () => {
    renderSheet({ fit: fit("wont_fit") });

    expect(screen.getByText("Not enough memory")).toBeOnTheScreen();
    expect(screen.queryByTestId("voice-memory-continue")).toBeNull();
    expect(screen.getByTestId("voice-memory-smaller-model")).toBeOnTheScreen();
  });

  it("bar rows carry proportional widths", () => {
    renderSheet({ fit: fit("tight") });
    const bar = screen.getByTestId("voice-memory-bar");
    const segments = Array.from(bar.children).filter(
      (child): child is ReactTestInstance =>
        typeof child !== "string" && "props" in child,
    );
    const chatWidth = segments[0]?.props.style?.width as string;
    const sttWidth = segments[1]?.props.style?.width as string;
    // 1 GB / 2 GB available, 226 MB: chat ~50%, stt ~19% of the total.
    expect(chatWidth).toMatch(/%$/);
    expect(Number.parseFloat(chatWidth)).toBeGreaterThan(
      Number.parseFloat(sttWidth),
    );
  });
});
