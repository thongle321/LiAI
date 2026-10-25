/** CompanionCard renders PocketPal's SquarePalCard shape and wires its
 *  three actions: the tap surface opens the editor, the avatar badge
 *  activates the companion for chat, and the name row shares and deletes.
 *
 *  The hook points are accessibility labels plus the pill, because the
 *  Uniwind visual styling itself is not meaningful under Jest.
 */

import { Alert } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { CompanionCard } from "../companion-card.tsx";
import { PIP_COMPANION } from "@/services/companions/builtins.ts";
import { shareCompanions } from "@/services/companions/share-companions.ts";
import { useActivateCompanion } from "@/hooks/useActivateCompanion.ts";
import { useModelStore } from "@/store/model-store.ts";
import type { Companion } from "@/types/companion.ts";

const mockActivate = jest.fn<Promise<void>, [Companion]>(() => Promise.resolve());
jest.mock("@/hooks/useActivateCompanion.ts", () => ({
  useActivateCompanion: () => mockActivate,
}));

jest.mock("@/services/companions/share-companions.ts", () => ({
  shareCompanions: jest.fn(() => Promise.resolve()),
}));

/** The real companions store is TinyBase-backed; the card only reads the
 *  deleter, so a one-selector stub keeps it observable by value. */
const mockDeleteCompanion = jest.fn((id: string) => Promise.resolve(true));
jest.mock("@/store/companions.ts", () => ({
  useCompanions: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ deleteCompanion: mockDeleteCompanion }),
}));

const pip: Companion = {
  ...PIP_COMPANION,
  id: "pip",
  name: "Pip",
  color: ["#0E0D0C", "#FAFAFA"],
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const lookie: Companion = {
  ...pip,
  id: "lookie",
  name: "Lookie",
  description: "Real-time video analysis.",
  capabilities: { video: true },
  defaultModel: { id: "lookie-model", name: "Lookie Model", author: "test" },
};

const mockOnOpen = jest.fn();

function readySpec(id: string): Record<string, unknown> {
  return { id, downloadStatus: "completed" };
}

function setup(companion: Companion, models: Record<string, unknown>[] = []): void {
  useModelStore.setState({ models: models as never, remoteApis: [] as never });
  render(<CompanionCard companion={companion} onOpen={mockOnOpen} />);
}

describe("CompanionCard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("opens the editor from the tap itself", () => {
    setup(pip);
    fireEvent.press(screen.getByTestId("companion-card-pip"));
    expect(mockOnOpen).toHaveBeenCalledTimes(1);
  });

  it("activates chat from the avatar badge, not the tap", () => {
    setup(pip);
    fireEvent.press(screen.getByLabelText("Use Pip in chat"));
    expect(mockActivate).toHaveBeenCalledWith(pip);
    expect(mockOnOpen).not.toHaveBeenCalled();
  });

  it("renders a letter avatar tinted by the companion color", () => {
    setup(pip);
    const letter = screen.getByText("P");
    expect(letter.props.style).toMatchObject({ color: "#FFFFFF" });
  });

  it("falls back to the brand-tinted letter when no color is set", () => {
    setup({ ...pip, color: undefined });
    const letter = screen.getByText("P");
    expect(letter.props.style).toMatchObject({ color: "#FFFFFF" }); // #333333 is dark
  });

  it("warns when the linked model is not downloaded", () => {
    setup(lookie, [readySpec("other-model")]);
    expect(screen.getByText("Model not downloaded")).toBeOnTheScreen();
  });

  it("stays quiet when the linked model IS downloaded", () => {
    setup(lookie, [readySpec("lookie-model")]);
    expect(screen.queryByText("Model not downloaded")).toBeNull();
  });

  it("collapses the description to one line while warning", () => {
    setup(lookie, []);
    expect(screen.getByText("Real-time video analysis.").props.numberOfLines).toBe(1);
  });

  it("keeps two description lines when there is no warning", () => {
    setup(lookie, [readySpec("lookie-model")]);
    expect(screen.getByText("Real-time video analysis.").props.numberOfLines).toBe(2);
  });

  it("falls back to the cleaned system prompt when description is absent", () => {
    const promptOnly: Companion = {
      ...pip,
      description: undefined,
      systemPrompt: "You are a friendly helper. Be concise.",
    };
    setup(promptOnly);
    // The reference's cleanSystemPrompt strips the preamble AND the
    // trailing technicality.
    expect(screen.getByText("a friendly helper")).toBeOnTheScreen();
  });

  it("shares the companion through the device glue", async () => {
    setup(pip);
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Share Pip"));
    });
    expect(shareCompanions).toHaveBeenCalledWith([pip]);
  });

  it("deletes only after a confirmed prompt", () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
      const remove = buttons?.find((b) => b.text === "Delete");
      remove?.onPress?.();
    });
    setup(pip);
    fireEvent.press(screen.getByLabelText("Delete Pip"));
    expect(alert).toHaveBeenCalledWith(
      "Delete Companion",
      expect.stringContaining("Pip"),
      expect.anything(),
    );
    expect(mockDeleteCompanion).toHaveBeenCalledWith("pip");
  });
});
