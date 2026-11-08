/** CompanionEditorSheet's save contract for a CUSTOM companion: a template
 *  becomes a stored companion, and a write that never landed keeps the form
 *  (and the user's typing) instead of closing on nothing.
 *
 *  The store is stubbed by value because the real one is TinyBase-backed;
 *  what this covers is the sheet's own translation from draft to stored
 *  shape. Talent toggles are native switches, so they are device territory.
 */

import { Alert } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { CompanionEditorSheet } from "../companion-editor-sheet.tsx";
import { useModelStore } from "@/store/model-store.ts";
import { makePreset } from "@/jest/fixtures/models.ts";
import {
  createNewAssistantCompanion,
  createNewRoleplayCompanion,
} from "@/types/companion.ts";

const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
jest.mock("@/store/companions.ts", () => ({
  useCompanions: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      companions: [],
      createCompanion: mockCreate,
      updateCompanion: mockUpdate,
      deleteCompanion: mockDelete,
    }),
}));

/** The real model store is a singleton; each case states its own catalog. */
const realStartDownload = useModelStore.getState().startDownload;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  useModelStore.setState({
    models: [],
    presets: [],
    startDownload: realStartDownload,
  });
});

describe("CompanionEditorSheet create", () => {
  it("stores a custom companion from the roleplay template", async () => {
    mockCreate.mockResolvedValue({ id: "new", created_at: "t", updated_at: "t" });
    const onClose = jest.fn();
    render(
      <CompanionEditorSheet
        companion={createNewRoleplayCompanion()}
        onClose={onClose}
      />,
    );

    fireEvent.changeText(screen.getByLabelText("Name"), "  Sage  ");
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Save companion"));
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "local",
        name: "Sage",
        pact: { talents: [] },
      }),
    );
    // The roleplay template carries a schema block, so the parameters it
    // declares travel with the companion rather than being flattened away.
    expect(mockCreate.mock.calls[0][0].parameterSchema.length).toBeGreaterThan(0);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps the editor open when the write never landed", async () => {
    mockCreate.mockResolvedValue(null);
    const onClose = jest.fn();
    render(
      <CompanionEditorSheet
        companion={createNewAssistantCompanion()}
        onClose={onClose}
      />,
    );

    fireEvent.changeText(screen.getByLabelText("Name"), "Sage");
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Save companion"));
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith(
      "Couldn't save companion",
      expect.any(String),
    );
  });
});

describe("CompanionEditorSheet edit", () => {
  const stored = {
    ...createNewAssistantCompanion(),
    id: "sage",
    name: "Sage",
    description: "before",
    created_at: "t",
    updated_at: "t",
  };

  it("patches the stored companion instead of creating a second one", async () => {
    mockUpdate.mockResolvedValue({ ...stored, description: "after" });
    const onClose = jest.fn();
    render(
      <CompanionEditorSheet companion={stored} onClose={onClose} />,
    );

    fireEvent.changeText(screen.getByLabelText("Description"), "after");
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Save companion"));
    });

    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith(
      "sage",
      expect.objectContaining({ description: "after" }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps the sheet (and the companion) when the delete never landed", async () => {
    mockDelete.mockResolvedValue(false);
    const onClose = jest.fn();
    // The confirm prompt is the sheet's own: answer its Delete button.
    (Alert.alert as jest.Mock).mockImplementation(
      (title: string, _message?: string, buttons?: { text?: string; onPress?: () => void }[]) => {
        if (title === "Delete companion?") {
          buttons?.find((b) => b.text === "Delete")?.onPress?.();
        }
      },
    );
    render(<CompanionEditorSheet companion={stored} onClose={onClose} />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Delete companion"));
    });

    expect(mockDelete).toHaveBeenCalledWith("sage");
    expect(onClose).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith(
      "Couldn't delete companion",
      expect.any(String),
    );
  });

  it("offers a download for a linked model the catalog still ships", async () => {
    const preset = makePreset({
      id: "p",
      name: "Preset One",
      files: [{ name: "p.gguf", size: 99, downloadUrl: "u" }],
    });
    const startDownload = jest.fn(() => Promise.resolve());
    useModelStore.setState({
      models: [],
      presets: [preset],
      startDownload: startDownload as never,
    });
    render(
      <CompanionEditorSheet
        companion={{
          ...stored,
          defaultModel: {
            id: "preset-p-p.gguf",
            name: "Preset One",
            author: "Author",
            file: { name: "p.gguf", size: 99 },
          },
        }}
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByText(/Recommended model: Preset One/)).toBeOnTheScreen();
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Download Preset One"));
    });
    expect(startDownload).toHaveBeenCalledWith("p", preset.files[0]);
  });

  it("says so when the linked model is gone from the catalog", () => {
    render(
      <CompanionEditorSheet
        companion={{
          ...stored,
          defaultModel: { id: "gone", name: "Gone Model", author: "Author" },
        }}
        onClose={jest.fn()}
      />,
    );
    expect(screen.getByText(/isn’t in the catalog any more/)).toBeOnTheScreen();
  });
});
