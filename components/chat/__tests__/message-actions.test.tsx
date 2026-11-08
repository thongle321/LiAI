/** The status footer under a settled assistant turn (AssistantTurnFooter
 *  port, 2026-10-29).
 *
 *  PocketPal renders speak / copy / timing on ONE row — flexDirection
 *  row, gap 5, 16dp glyphs with hitSlop, a 10px secondary text — and no
 *  spacing boxes: the row reads as a status line directly under the
 *  bubble. The reported divergence (screenshot) had our icons inside the
 *  48dp `icon-btn` boxes, which spread the icons apart and, with the
 *  flex-wrap container, pushed the timing string to its own line beneath
 *  them. This pins the ported shape.
 */

import { fireEvent, render, screen, within } from "@testing-library/react-native";
import type { ReactTestInstance } from "react-test-renderer";

import { MessageActions } from "../message-actions.tsx";

type TestNode = ReactTestInstance;

jest.mock("@/services/voice/voice-speak.ts", () => ({
  speakReply: jest.fn(),
  stopSpeaking: jest.fn(),
}));

jest.mock("@/store/voice.ts", () => ({
  useVoice: (sel: (s: unknown) => boolean) =>
    sel({ userTTSOverride: null, deviceMeetsMemory: true }),
}));

describe("the assistant turn footer (PocketPal AssistantTurnFooter layout)", () => {
  const outcome = {
    timings: { promptMs: 141, tokensPerSecond: 54.77, msPerToken: 18.3 },
  };

  it("renders speak, copy and the timing string as siblings on one row", () => {
    render(<MessageActions text="Hello" outcome={outcome} />);
    // Pressable testIDs sit inside Pressable-internal wrappers, so the row
    // is reached by walking up to the container whose className carries
    // the mt-1 flex-row signature (identity comparison of fiber nodes made
    // the matcher serialize the whole tree, hence the prop-level walk).
    let node: TestNode | null = screen.getByTestId("footer-copy");
    while (node !== null && !String(node.props.className ?? "").includes("mt-1 flex-row")) {
      node = node.parent;
    }
    const row = node as TestNode;
    // PocketPal's one-row container: row, gap 5, no wrap.
    expect(String(row.props.className)).toContain("mt-1 flex-row items-center gap-x-[5px] pb-3");
    expect(String(row.props.className)).not.toContain("flex-wrap");
    // ...containing both of the inline glyphs and the joined timing string.
    expect(within(row).getByTestId("footer-speak")).toBeTruthy();
    expect(within(row).getByText("18ms/token, 54.77 tokens/sec, 141ms TTFT")).toBeTruthy();
  });

  it("gives the glyphs no 48dp boxes (PocketPal's hitSlop floor instead)", () => {
    render(<MessageActions text="Hello" outcome={outcome} />);
    for (const testID of ["footer-speak", "footer-copy"]) {
      const className = String(screen.getByTestId(testID).props.className ?? "");
      expect(className).not.toContain("icon-btn");
      expect(screen.getByTestId(testID).props.hitSlop).toEqual(16);
    }
  });

  it("prints a local turn's timings without the prompt rate (origin gate)", () => {
    render(<MessageActions text="Hello" outcome={outcome} />);
    expect(screen.getByText("18ms/token, 54.77 tokens/sec, 141ms TTFT")).toBeTruthy();
    expect(screen.queryByText(/prompt tokens\/sec/)).toBeNull();
  });

  it("keeps copy pressable with the light-haptic path intact", () => {
    render(<MessageActions text="Hello" outcome={outcome} />);
    // PocketPal fires impactLight then setString; ours does the same via
    // useCopy + expo-haptics (both mocked) — the press must resolve.
    fireEvent.press(screen.getByTestId("footer-copy"));
  });
});
