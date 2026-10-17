/** The one native GGUF header read.
 *
 * Split from gguf-metadata.ts so the reads over a header stay pure and
 * jest can reach them; this half pulls in llama.rn and cannot.
 *
 * A header is a bonus fact, never a gate: an unreadable one leaves the
 * metadata absent and must not fail a download, a reconcile or a load.
 */

import { loadLlamaModelInfo } from "llama.rn";

import {
  ggufMetadataFromHeader,
  type GgufHeader,
} from "./gguf-metadata.ts";
import { sanitizeGgufMetadata } from "@/utils/model-upgrade.ts";

/** Candidate paths for a file already on disk: downloads land in
 *  `models/`, local imports in `models/local/`. Neither the stored
 *  localPath nor `models/` alone covers both. */
function candidatePaths(
  documentDir: string,
  fileName: string,
): string[] {
  const base = documentDir.endsWith("/") ? documentDir : `${documentDir}/`;
  const safe = fileName.split("/").pop() ?? fileName;
  return [`${base}models/${safe}`, `${base}models/local/${safe}`];
}

/** The record to store on ModelSpec.ggufMetadata, or undefined when the
 *  header cannot be read or carries nothing usable. */
export async function readGgufMetadata(
  documentDir: string,
  fileName: string,
): Promise<Record<string, unknown> | undefined> {
  for (const path of candidatePaths(documentDir, fileName)) {
    try {
      const metadata = sanitizeGgufMetadata(
        ggufMetadataFromHeader((await loadLlamaModelInfo(path)) as GgufHeader),
      );
      if (metadata) return metadata;
    } catch {
      // Not this path, or not a readable GGUF: try the next, then give up.
    }
  }
  return undefined;
}
