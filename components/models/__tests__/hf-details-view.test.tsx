/** The file list must be mounted before the files arrive: TrueSheet reads
 *  `scrollableRef` when the details sheet presents, so a loading branch that
 *  replaces the FlatList leaves the ref null and lets content drags move the
 *  sheet instead of only the grabber. */

import { createRef } from "react";
import { FlatList } from "react-native";
import { render, screen } from "@testing-library/react-native";

import { HFDetailsView } from "../hf-details-view.tsx";
import type { HFModelFile, HFModelSearchResult } from "@/types/models";

const result: HFModelSearchResult = {
  modelId: "org/model",
  author: "org",
  name: "model",
  description: "",
  tags: [],
  downloads: 1,
  likes: 1,
  gated: false,
  ggufFiles: [],
};

it("keeps the file list mounted while files load and binds the ref", () => {
  const listRef = createRef<FlatList<HFModelFile>>();
  render(
    <HFDetailsView
      result={result}
      files={[]}
      filesLoading
      onBack={() => {}}
      onStartDownload={() => {}}
      listRef={listRef}
    />,
  );

  expect(screen.getByTestId("hf-details-file-list")).toBeOnTheScreen();
  expect(listRef.current).not.toBeNull();
});

it("keeps the file list mounted and binds the ref when files load", () => {
  const listRef = createRef<FlatList<HFModelFile>>();
  const files: HFModelFile[] = [
    {
      name: "model.gguf",
      size: 1000,
      path: "model.gguf",
      downloadUrl: "https://example.com/model.gguf",
      oid: "oid",
    },
  ];
  render(
    <HFDetailsView
      result={result}
      files={files}
      filesLoading={false}
      onBack={() => {}}
      onStartDownload={() => {}}
      listRef={listRef}
    />,
  );

  expect(screen.getByTestId("hf-details-file-list")).toBeOnTheScreen();
  expect(listRef.current).not.toBeNull();
});
