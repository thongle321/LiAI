import { useEffect } from "react";
import { Text } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react-native";

import { MessageMenu } from "../message-menu.tsx";

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "light" },
}));

jest.mock("expo-clipboard", () => ({
  setStringAsync: jest.fn().mockResolvedValue(undefined),
}));

const impactAsync = jest.mocked(Haptics.impactAsync);
const setStringAsync = jest.mocked(Clipboard.setStringAsync);

/** The two models the submenu is built from: one on this device (the active
 *  one) and one remote, whose host is what distinguishes it from a local
 *  model of the same name. */
const models = [
  { id: "m1", name: "Model One", active: true },
  { id: "m2", name: "Model Two", host: "remote.example", active: false },
];

/** One call site's worth of defaults; every test varies only the prop it is
 *  about, so the menu's shape lives in one place. */
function renderMenu(
  overrides: Partial<Parameters<typeof MessageMenu>[0]> = {},
): ReturnType<typeof render> {
  return render(
    <MessageMenu
      text="hello"
      settled
      role="assistant"
      canRun
      models={models}
      onEdit={() => {}}
      onRegenerateWith={() => {}}
      {...overrides}
    >
      <></>
    </MessageMenu>,
  );
}

describe("MessageMenu", () => {
  it("renders the menu container when settled", () => {
    renderMenu();
    expect(screen.getByTestId("message-menu")).toBeTruthy();
  });

  it("keeps the menu root while streaming, with no actions", () => {
    renderMenu({ settled: false });
    // The container is the SAME element type as when settled; only the
    // action list is empty. Swapping the root type is what remounted the
    // bubble at the end of a stream.
    expect(screen.getByTestId("message-menu")).toBeTruthy();
    expect(screen.queryByTestId("menu-action-copy")).toBeNull();
    expect(screen.queryByTestId("menu-action-regenerate")).toBeNull();
  });

  it("does not remount the bubble when the turn settles", () => {
    let mounts = 0;
    function Probe() {
      useEffect(() => {
        mounts += 1;
      }, []);
      return <Text>reply body</Text>;
    }
    const menu = (settled: boolean) => (
      <MessageMenu
        text="hello"
        settled={settled}
        role="assistant"
        canRun
        models={models}
        onEdit={() => {}}
        onRegenerateWith={() => {}}
      >
        <Probe />
      </MessageMenu>
    );

    const { rerender } = render(menu(false));
    expect(mounts).toBe(1);
    rerender(menu(true));
    // Still one mount: settling updates props, it does not replace the
    // subtree. A failure here is the reported "refresh on completion".
    expect(mounts).toBe(1);
    expect(screen.getByText("reply body")).toBeTruthy();
    expect(screen.getByTestId("menu-action-copy")).toBeTruthy();
  });

  it("copies the reply text", async () => {
    renderMenu();
    // The clipboard write resolves off the press, and `useCopy` then sets
    // its "copied" state — await the microtask inside act so the update
    // lands in this test rather than the next one.
    await act(async () => {
      fireEvent.press(screen.getByTestId("menu-action-copy"));
    });
    expect(setStringAsync).toHaveBeenCalledWith("hello");
  });

  it("fires the open haptic once the menu can actually open", () => {
    renderMenu();
    fireEvent(screen.getByTestId("menu-trigger"), "longPress");
    expect(impactAsync).toHaveBeenCalledWith("light");
  });

  it("stays silent while the turn is still streaming", () => {
    renderMenu({ settled: false });
    fireEvent(screen.getByTestId("menu-trigger"), "longPress");
    expect(impactAsync).not.toHaveBeenCalled();
  });

  it("dispatches regenerate on assistant rows", () => {
    const onRegenerate = jest.fn();
    renderMenu({ onRegenerate });
    fireEvent.press(screen.getByTestId("menu-action-regenerate"));
    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });

  it("does not offer regenerate on user rows", () => {
    renderMenu({ role: "user" });
    expect(screen.queryByTestId("menu-action-regenerate")).toBeNull();
  });

  it("disables regenerate without a loaded model", () => {
    renderMenu({ canRun: false });
    expect(screen.getByTestId("menu-action-regenerate")).toBeDisabled();
  });

  it("dispatches regenerate-with with the chosen model id", () => {
    const onRegenerateWith = jest.fn();
    renderMenu({ onRegenerateWith });
    fireEvent.press(screen.getByTestId("menu-action-regenerate-with:m1"));
    expect(onRegenerateWith).toHaveBeenCalledWith("m1");
  });

  it("keeps regenerate-with reachable without a loaded model", () => {
    // PocketPal disables it only while stopping / in voice mode: switching
    // model is the recovery path when the active one is not loaded.
    renderMenu({ canRun: false });
    expect(
      screen.getByTestId("menu-action-regenerate-with"),
    ).not.toBeDisabled();
  });

  it("lists every model, disambiguating remotes, and marks the active one", () => {
    renderMenu();
    const active = screen.getByTestId("menu-action-regenerate-with:m1");
    const remote = screen.getByTestId("menu-action-regenerate-with:m2");
    expect(within(active).getByText("Model One")).toBeTruthy();
    expect(within(remote).getByText("Model Two (remote.example)")).toBeTruthy();
    expect(within(active).getByText("✓")).toBeTruthy();
    expect(within(remote).queryByText("✓")).toBeNull();
  });

  it("dispatches edit on user rows", () => {
    const onEdit = jest.fn();
    renderMenu({ role: "user", onEdit });
    fireEvent.press(screen.getByTestId("menu-action-edit"));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("does not offer edit on assistant rows", () => {
    renderMenu();
    expect(screen.queryByTestId("menu-action-edit")).toBeNull();
  });
});
