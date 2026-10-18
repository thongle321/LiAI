/**
 * The pending row is a live status surface: it tells the user that a turn is
 * moving, when it is stopping, and which phase is running. These are
 * accessibility-visible labels, so they are the hook point: they must stay
 * truthful even while the visual dots and Uniwind styling are not meaningful
 * under Jest.
 */

import { render, screen } from "@testing-library/react-native";

import { PendingIndicator } from "../pending-indicator.tsx";
import { useChatStore } from "@/store/chat.ts";

function seed(over: Record<string, unknown> = {}): void {
  useChatStore.setState({
    sending: true,
    stopping: false,
    pendingToolName: null,
    toolTokenCount: 0,
    ...over,
  } as never);
}

afterEach(() => {
  seed();
});

describe("PendingIndicator status row", () => {
  it("announces replying with no elapsed time when nothing has started", () => {
    seed();
    render(<PendingIndicator startedAt={null} widths={{ assistant: 240, user: 200 }} />);
    expect(
      screen.getByLabelText("LiAI is replying"),
    ).toBeTruthy();
  });

  it("announces elapsed seconds once a turn is running", () => {
    seed();
    render(
      <PendingIndicator
        startedAt={Date.now() - 3_000}
        widths={{ assistant: 240, user: 200 }}
      />,
    );
    // The first tick runs on mount, so the second tick lands from the test.
    expect(
      screen.getByLabelText(/LiAI is replying, [0-9]+ seconds/),
    ).toBeTruthy();
  });

  it("reads as stopping alone", () => {
    seed({ stopping: true, pendingToolName: "web_search", toolTokenCount: 12 });
    render(<PendingIndicator startedAt={Date.now() - 3_000} widths={{ assistant: 240, user: 200 }} />);
    expect(screen.getByLabelText("LiAI is stopping")).toBeTruthy();
  });

  it("names the running phase while a tool is in flight", () => {
    seed({ pendingToolName: "web_search" });
    render(<PendingIndicator startedAt={Date.now()} widths={{ assistant: 240, user: 200 }} />);
    expect(
      screen.getByLabelText(/LiAI is replying, Preparing tool phase/),
    ).toBeTruthy();
  });
});
