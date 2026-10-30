/** The model card's download control is PocketPal's wide text button
 *  (ModelCard.tsx:454-478), not the icon-only variant the HF file row uses
 *  (ModelFileCard.tsx:397-414). */

import { render, screen } from "@testing-library/react-native";

import { ModelCard } from "../model-card.tsx";
import { makeSpec } from "@/jest/fixtures/models.ts";

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
