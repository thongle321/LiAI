/** The HF file row's redesign to PocketParity (ModelFileCard.tsx):
 *
 *  - the file's SIZE is the chip's replacement under the name — "4.37 GB",
 *    the pair's combined footprint when a projector is paired (the same
 *    getEnhancedSizeDisplay formula) — not a "GGUF" kind label;
 *  - the download control is an ICON, not a text button: green Download
 *    when it fits, grayed DownloadOff when it does not;
 *  - while a transfer is live (downloading or paused) the BOOKMARK icon
 *    is swapped for a close/Cancel icon — one control per state, so the
 *    separate "Cancel download" row goes.
 *
 *  Seams (agreed in the plan): the row's rendered UI — getByText /
 *  getByLabelText / store-action overrides. MISSes: the sheet's grid
 *  layout outside the row, and the TrueSheet detent config (asserted at
 *  the source in jest/hf-details-sheet-scroll.test.ts).
 */

import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";

import { HFFileRow } from "../hf-file-row.tsx";
import { useModelStore } from "@/store/model-store";
import { formatBytes } from "@/services/models/progress.ts";
import type { HFModelFile, HFModelSearchResult } from "@/types/models";

const LLM_BYTES = 4_370_000_000;
const MMPROJ_BYTES = 500_000_000;

function makeFile(name: string, size: number): HFModelFile {
  return { name, size, path: `./${name}`, downloadUrl: `https://hf/${name}` };
}

const result: HFModelSearchResult = {
  modelId: "org/test-model",
  author: "org",
  name: "test-model",
  description: "",
  tags: [],
  downloads: 10,
  likes: 5,
  gated: false,
  ggufFiles: [],
};

const textOnlyFile = makeFile("test-model.Q4_K_M.gguf", LLM_BYTES);

function rowFor(
  file: HFModelFile,
  siblings: HFModelFile[],
  freeBytes = 1e12,
): ReactElement {
  return (
    <HFFileRow
      result={result}
      file={file}
      siblings={siblings}
      freeBytes={freeBytes}
      checked={true}
      onDownload={jest.fn()}
      onUnbookmark={jest.fn()}
      onWarn={jest.fn()}
    />
  );
}

function specState(
  file: HFModelFile,
  patch: Record<string, unknown> = {},
): void {
  useModelStore.setState({
    models: [
      {
        id: `hf-${result.modelId}-${file.name}`,
        name: file.name,
        downloadStatus: "idle",
        downloadProgress: 0,
        ...patch,
      },
    ],
  } as never);
}

beforeEach(() => {
  useModelStore.setState({ models: [] } as never);
});

describe("size display", () => {
  it("shows the file's size, not a GGUF kind chip", () => {
    render(rowFor(textOnlyFile, [textOnlyFile]));

    expect(screen.queryByText("GGUF")).toBeNull();
    expect(screen.getByText(formatBytes(LLM_BYTES, 2, false, true))).toBeOnTheScreen();
  });

  it("a paired vision row shows the pair's combined footprint", () => {
    const projector = makeFile("test-model.mmproj-f16.gguf", MMPROJ_BYTES);
    render(rowFor(textOnlyFile, [textOnlyFile, projector]));

    expect(
      screen.getByText(formatBytes(LLM_BYTES + MMPROJ_BYTES, 2, false, true)),
    ).toBeOnTheScreen();
  });
});

describe("the download control", () => {
  it("idle and fitting: an icon, not a text button", () => {
    specState(textOnlyFile);
    render(rowFor(textOnlyFile, [textOnlyFile]));

    expect(screen.queryByText("Download")).toBeNull();
    expect(screen.getByLabelText("Download model")).toBeOnTheScreen();
  });

  it("cannot fit: the control is disabled (grayed prohibition glyph)", () => {
    specState(textOnlyFile);
    render(rowFor(textOnlyFile, [textOnlyFile], 1e6));

    expect(
      screen.getByLabelText("Download model").props.accessibilityState.disabled,
    ).toBe(true);
  });
});

describe("a live transfer", () => {
  it("downloading swaps the bookmark for a cancel icon", () => {
    specState(textOnlyFile, { downloadStatus: "downloading", downloadProgress: 30 });
    const cancel = jest.fn();
    useModelStore.setState({ cancelModelDownload: cancel } as never);
    render(rowFor(textOnlyFile, [textOnlyFile]));

    expect(screen.queryByLabelText(`Bookmark ${textOnlyFile.name}`)).toBeNull();
    fireEvent.press(screen.getByLabelText(`Cancel ${textOnlyFile.name} download`));
    expect(cancel).toHaveBeenCalledWith(`hf-${result.modelId}-${textOnlyFile.name}`);
  });

  it("paused keeps the swap: cancel, not a second row of text", () => {
    specState(textOnlyFile, { downloadStatus: "paused", downloadProgress: 30 });
    render(rowFor(textOnlyFile, [textOnlyFile]));

    expect(screen.getByLabelText(`Cancel ${textOnlyFile.name} download`)).toBeOnTheScreen();
    expect(screen.queryByText("Cancel download")).toBeNull();
  });
});
