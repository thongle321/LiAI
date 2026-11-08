/** The model card's download control is PocketPal's wide text button
 *  (ModelCard.tsx:454-478), not the icon-only variant the HF file row uses
 *  (ModelFileCard.tsx:397-414). */

import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { ModelCard } from "../model-card.tsx";
import { makeSpec } from "@/jest/fixtures/models.ts";
import { useModelStore } from "@/store/model-store.ts";

/** A vision spec whose recorded projector is not on disk: the collapsed
 *  card must offer the projector leg without expanding details (PocketPal
 *  #1053 moved this affordance above the fold). */
function visionSpecMissingProjector(
  over: Partial<Parameters<typeof makeSpec>[0]> = {},
) {
  return makeSpec({
    supportsVision: true,
    visionEnabled: true,
    projector: {
      name: "mmproj-model-f16.gguf",
      size: 851_234_567,
      downloadUrl: "https://hf/mmproj-model-f16.gguf",
    },
    downloadStatus: "idle",
    ...over,
  });
}

it("offers Download projection model on the collapsed card when the projector is missing", () => {
  const spec = visionSpecMissingProjector();

  render(
    <ModelCard
      item={spec}
      isActive={false}
      onActivate={() => {}}
      onDeactivate={() => {}}
      onSettings={() => {}}
    />,
  );

  // Collapsed: details were never expanded.
  expect(screen.getByLabelText("Download projection model")).toBeOnTheScreen();
});

it("starts the projector leg when the collapsed offer is tapped", () => {
  const spec = visionSpecMissingProjector();
  const startProjectorDownload = jest.fn();
  act(() => {
    useModelStore.setState({ startProjectorDownload });
  });

  render(
    <ModelCard
      item={spec}
      isActive={false}
      onActivate={() => {}}
      onDeactivate={() => {}}
      onSettings={() => {}}
    />,
  );

  fireEvent.press(screen.getByLabelText("Download projection model"));

  // Spec Q3: the offer runs the projector leg ONLY — never a re-download
  // of the LLM (startSpecDownload re-sequences through pairDownloadStep).
  expect(startProjectorDownload).toHaveBeenCalledWith(spec.id);
});

it("hides the offer while a projector leg is in flight: the cancel row is the progress readout", () => {
  const spec = visionSpecMissingProjector({ downloadStatus: "downloading" });

  render(
    <ModelCard
      item={spec}
      isActive={false}
      onActivate={() => {}}
      onDeactivate={() => {}}
      onSettings={() => {}}
    />,
  );

  expect(screen.queryByLabelText("Download projection model")).toBeNull();
  expect(screen.getByLabelText(/Cancel/)).toBeOnTheScreen();
});

it.each([
  ["vision is off", { visionEnabled: false }],
  ["the model is text-only", { supportsVision: false }],
  ["no projector is recorded", { projector: undefined }],
  ["the pair already landed", { downloadStatus: "completed" as const }],
])("offers nothing when %s", (_label, over) => {
  const spec = visionSpecMissingProjector(over);

  render(
    <ModelCard
      item={spec}
      isActive={false}
      onActivate={() => {}}
      onDeactivate={() => {}}
      onSettings={() => {}}
    />,
  );

  expect(screen.queryByLabelText("Download projection model")).toBeNull();
});

it("offers a text Download button on a bookmark", () => {
  const spec = makeSpec({
    files: [
      {
        name: "model.Q4_K_M.gguf",
        size: 10,
        downloadUrl: "https://hf/model.Q4_K_M.gguf",
      },
    ],
  });

  render(
    <ModelCard
      item={spec}
      isActive={false}
      onActivate={() => {}}
      onDeactivate={() => {}}
      onSettings={() => {}}
      onDownload={() => {}}
    />,
  );

  expect(screen.getByText("Download")).toBeOnTheScreen();
  expect(screen.getByLabelText("Download model")).toBeOnTheScreen();
});

/** The card's loading state is FED, not owned: the eager-load coordinator
 *  writes `isContextLoading`/`loadingModelId` on the model store (spec
 *  "Screen wiring"), the card only reads them. */
it("spins Loading... and disables the button on the card whose load is in flight", () => {
  const spec = makeSpec({ downloadStatus: "completed" });
  act(() => {
    useModelStore.setState({ isContextLoading: true, loadingModelId: spec.id });
  });

  render(
    <ModelCard
      item={spec}
      isActive={false}
      onActivate={() => {}}
      onDeactivate={() => {}}
      onSettings={() => {}}
    />,
  );

  expect(screen.getByLabelText("Loading model")).toBeOnTheScreen();
  expect(screen.getByLabelText("Loading model")).toBeDisabled();
});

it("keeps another card's in-flight load off this one: it stays loadable", () => {
  const spec = makeSpec({ downloadStatus: "completed" });
  act(() => {
    useModelStore.setState({ isContextLoading: true, loadingModelId: "other" });
  });

  render(
    <ModelCard
      item={spec}
      isActive={false}
      onActivate={() => {}}
      onDeactivate={() => {}}
      onSettings={() => {}}
    />,
  );

  const loadButton = screen.getByLabelText(`Load ${spec.name}`);
  expect(loadButton).toBeOnTheScreen();
  expect(loadButton).not.toBeDisabled();
});
