/** Local file import helpers: type inference + ModelSpec builder (pure, tested). */

import type { ModelSpec } from "../types/models";

export function inferLocalModelType(fileName: string): ModelSpec["type"] {
  const lower = fileName.toLowerCase();
  if (
    lower.includes("mmproj") ||
    lower.includes("clip") ||
    lower.includes("vision")
  ) {
    return "vision";
  }
  return "llm";
}

export function buildLocalModelSpec(input: {
  id: string;
  fileName: string;
  size: number;
}): ModelSpec {
  return {
    id: input.id,
    name: input.fileName,
    author: "Local",
    description: "",
    origin: "local",
    type: inferLocalModelType(input.fileName),
    files: [{ name: input.fileName, size: input.size, downloadUrl: "" }],
    localPath: `models/local/${input.fileName}`,
    downloadStatus: "completed",
    downloadProgress: 100,
    downloadedBytes: input.size,
    totalBytes: input.size,
  };
}

/** Numbered fallback for keep-both collisions: "model.gguf" -> "model (2).gguf". */
export function numberedFileName(fileName: string, n: number): string {
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0) return `${fileName} (${n})`;
  return `${fileName.slice(0, dot)} (${n})${fileName.slice(dot)}`;
}
