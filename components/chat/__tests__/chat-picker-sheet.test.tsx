/** ChatPickerSheet: PocketPal's tabbed pal/model picker, LiAI shape.
 *
 *  These tests pin the behaviours the port is judged on: Models is the
 *  opening tab (PocketPal's `activeTab='models'`), the Companions tab lists
 *  installed companions with a capability subtitle (never the description),
 *  selecting either kind closes the sheet, the "No companion" unbind row
 *  only appears while one is actually bound, and the active companion row
 *  carries the reference's settings gear (the editor handoff) while every
 *  other row signals selection through the tint alone.
 */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ChatPickerSheet } from "../chat-picker-sheet.tsx";
import { PIP_COMPANION } from "@/services/companions/builtins.ts";
import { makeSpec } from "@/jest/fixtures/models.ts";
import { useChatStore } from "@/store/chat.ts";
import { useModelStore } from "@/store/model-store.ts";
import type { Companion } from "@/types/companion.ts";

const mockActivate = jest.fn<Promise<void>, [Companion]>(() => Promise.resolve());
jest.mock("@/hooks/useActivateCompanion.ts", () => ({
  useActivateCompanion: () => mockActivate,
}));

// Native-only module; the sheet calls dismiss on open. Nothing else in this
// suite loads it, so it stays a local fake rather than an __mocks__/external.
jest.mock("react-native-keyboard-controller", () => ({
  KeyboardControllerNative: { dismiss: jest.fn() },
}));

// The companions store persists through AsyncStorage, whose dynamic import
// cannot run under Jest's CJS VM. Only reads are used here, so a selector
// stub is both sufficient and faster than turning persistence back on.
// `mockCompanionSeed` starts as a self-contained literal (the factory runs
// while this file's imports are still resolving) and each setup() swaps it.
let mockCompanionSeed: unknown = { id: "pip", name: "Pip" };
jest.mock("@/store/companions.ts", () => ({
  ensureCompanionsLoaded: jest.fn(),
  useCompanions: (selector: (state: { companions: unknown[] }) => unknown) =>
    selector({ companions: [mockCompanionSeed] }),
}));

const onClose = jest.fn();
const onOpenEditor = jest.fn<void, [Companion]>();

const pip: Companion = {
  ...PIP_COMPANION,
  id: "pip",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const lookie: Companion = {
  ...pip,
  id: "lookie",
  name: "Lookie",
  capabilities: { video: true },
};

function readySpec(id: string, name: string) {
  return makeSpec({
    id,
    name,
    downloadStatus: "completed",
    files: [{ name: "model.gguf", size: 1, downloadUrl: "https://example.test/model.gguf" }],
  });
}

function setup(
  companionId: string | null = "pip",
  companion: Companion = pip,
  editor?: (companion: Companion) => void,
) {
  mockCompanionSeed = companion;
  // Replace activateModel with a synchronous test double that immediately
  // moves the active model pointer. The eager-load coordinator's own logic
  // is tested in services/inference/__tests__/eager-load.test.ts.
  act(() => {
    useModelStore.setState({
      models: [readySpec("alpha", "Alpha"), readySpec("beta", "Beta")],
      remoteApis: [],
      activeModelId: "alpha",
      activateModel: async (id: string) => {
        act(() => {
          useModelStore.setState({ activeModelId: id, activeProviderType: "local" });
        });
      },
    });
    useChatStore.setState({
      sessionId: null,
      stagedCompanionId: companionId,
    });
  });
  render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <ChatPickerSheet visible onClose={onClose} onOpenEditor={editor} />
    </SafeAreaProvider>,
  );
}

describe("ChatPickerSheet", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("opens on the Models tab", () => {
    setup();
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("Beta")).toBeTruthy();
    expect(screen.queryByText("Pip")).toBeNull();
  });

  it("switches to the Companions tab", () => {
    setup();
    fireEvent.press(screen.getByTestId("chat-picker-tab-companions"));
    // With horizontal paging FlatList, both tab contents are mounted but only one is visible.
    // Check that the Companions tab button is marked as selected.
    const companionsTab = screen.getByTestId("chat-picker-tab-companions");
    expect(companionsTab.props.accessibilityState).toMatchObject({ selected: true });
    // And the Models tab is not selected
    const modelsTab = screen.getByTestId("chat-picker-tab-models");
    expect(modelsTab.props.accessibilityState).toMatchObject({ selected: false });
  });

  it("activates the tapped companion and closes", () => {
    setup();
    fireEvent.press(screen.getByTestId("chat-picker-tab-companions"));
    fireEvent.press(screen.getByText("Pip"));
    expect(mockActivate).toHaveBeenCalledWith(pip);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("switches the active model and closes", () => {
    setup();
    fireEvent.press(screen.getByText("Beta"));
    expect(useModelStore.getState().activeModelId).toBe("beta");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("offers 'No companion' only while one is bound", () => {
    setup("pip");
    fireEvent.press(screen.getByTestId("chat-picker-tab-companions"));
    expect(screen.getByText("No companion")).toBeTruthy();
  });

  it("hides 'No companion' when no companion is bound", () => {
    setup(null);
    fireEvent.press(screen.getByTestId("chat-picker-tab-companions"));
    expect(screen.queryByText("No companion")).toBeNull();
  });

  it("reads the capability, not the description, as the row subtitle", () => {
    setup();
    fireEvent.press(screen.getByTestId("chat-picker-tab-companions"));
    // Pip carries a description AND the assistant fallback: the row must
    // show "Assistant" (reference getCapabilityText), never the prose.
    expect(screen.getByText("Assistant")).toBeTruthy();
    expect(screen.queryByText(PIP_COMPANION.description ?? "")).toBeNull();
  });

  it("names a video-capable companion 'Video'", () => {
    setup("lookie", lookie);
    fireEvent.press(screen.getByTestId("chat-picker-tab-companions"));
    expect(screen.getByText("Video")).toBeTruthy();
    expect(screen.queryByText("Assistant")).toBeNull();
  });

  it("marks the active companion row through the selection state only", () => {
    // With no editor callback the row carries NO gear — the tint pair is
    // the whole active signal, and the accessibility state stays truthful.
    // (The gear itself is pinned by the editor-handoff tests below.)
    setup("pip");
    fireEvent.press(screen.getByTestId("chat-picker-tab-companions"));
    const row = screen.getByLabelText("Use companion Pip");
    expect(row.props.accessibilityState).toMatchObject({ selected: true });
  });

  it("keeps the active row unmarked for the rest", () => {
    setup(null);
    fireEvent.press(screen.getByTestId("chat-picker-tab-companions"));
    const row = screen.getByLabelText("Use companion Pip");
    expect(row.props.accessibilityState).toMatchObject({ selected: false });
  });

  it("puts the editor gear on the active companion row", () => {
    // PocketPal's ChatPalModelPickerSheet: the gear sits beside the active
    // pal only — other rows have neither the icon nor a second meaning.
    setup("pip", pip, onOpenEditor);
    fireEvent.press(screen.getByTestId("chat-picker-tab-companions"));
    expect(screen.getByLabelText("Edit Pip")).toBeTruthy();
    expect(screen.queryByLabelText("Edit Lookie")).toBeNull();
  });

  it("hides the gear when no companion is bound", () => {
    setup(null, pip, onOpenEditor);
    fireEvent.press(screen.getByTestId("chat-picker-tab-companions"));
    expect(screen.queryByLabelText("Edit Pip")).toBeNull();
  });

  it("hands the bound companion to the editor and closes the sheet", () => {
    setup("pip", pip, onOpenEditor);
    fireEvent.press(screen.getByTestId("chat-picker-tab-companions"));
    fireEvent.press(screen.getByLabelText("Edit Pip"));
    expect(onOpenEditor).toHaveBeenCalledWith(pip);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
