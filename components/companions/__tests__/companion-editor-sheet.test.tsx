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

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
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
});
