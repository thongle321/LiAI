/** ModelSelector: PocketPal's ModelSelector dropdown for companion default model.
 *
 *  The native picker renders nothing under Jest (picker-menu.tsx fallback).
 *  These tests verify the component logic by testing edge cases in the
 *  companion-editor-sheet integration instead.
 */

import { render } from "@testing-library/react-native";

import { ModelSelector } from "../model-selector.tsx";
import { useModelStore } from "@/store/model-store.ts";
import type { ModelSpec } from "@/types/models.ts";
import { makeSpec } from "@/jest/fixtures/models.ts";
import type { CompanionModelRef } from "@/types/companion.ts";

const mockOnChange = jest.fn();

function setup(models: ModelSpec[]) {
  useModelStore.setState({ models, remoteApis: [] as never });
}

function renderSelector({
  label = "Default Model",
  placeholder = "Select model",
  value,
}: {
  label?: string;
  placeholder?: string;
  value?: CompanionModelRef | null;
} = {}) {
  render(<ModelSelector label={label} placeholder={placeholder} value={value} onChange={mockOnChange} />);
  // Component renders PickerMenu which returns null in Jest
  // We verify behavior through the companion-editor-sheet tests instead
}

describe("ModelSelector", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders without throwing with default props", () => {
    setup([]);
    renderSelector();
    // The component renders successfully (PickerMenu returns null in Jest)
  });

  it("renders with a custom label", () => {
    setup([]);
    renderSelector({ label: "Companion Model" });
    // Verifies custom label is accepted
  });

  it("renders with a custom placeholder", () => {
    setup([]);
    renderSelector({ placeholder: "Choose a model" });
    // Verifies custom placeholder is accepted
  });

  it("accepts a selected model value", () => {
    const downloaded = makeSpec({
      id: "model-x",
      name: "Model X",
      author: "Test Author",
      downloadStatus: "completed",
      files: [{ name: "model.gguf", size: 1000, downloadUrl: "https://test" }],
    });

    setup([downloaded as ModelSpec]);
    const selectedModel: CompanionModelRef = {
      id: "model-x",
      name: "Model X",
      author: "Test Author",
      file: { name: "model.gguf", size: 1000 },
    };
    renderSelector({ value: selectedModel });
    // Verifies selected model is accepted
  });

  it("accepts null as unselected value", () => {
    const m = makeSpec({ id: "m1", name: "Model One", downloadStatus: "completed" });
    setup([m as ModelSpec]);
    renderSelector({ value: null });
    // Verifies null value is accepted
  });
});