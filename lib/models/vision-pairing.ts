/** Vision-pairing rules for downloads (vision-series 01).
 *
 * The models card promises a vision model's REAL footprint — the LLM plus
 * its mmproj projector — but until this ticket nothing ever fetched the
 * projector: the HF picker filtered it out of the file list and the
 * download only carried the LLM. This module owns the two pure decisions:
 * which sibling is the projector, and what the download does next.
 *
 * Pure, so the rules stay tested without an expo-file-system seam.
 * `visionSizeBreakdown` (hf-format.ts) reads its size from HERE so the
 * card's promise and the downloader's fetch can never drift.
 */

/** Which sibling file is this LLM's projector, if any?
 *
 * Same rule the size card has always used: an mmproj sharing the model's
 * family prefix (mmproj-Qwen3-0.6B-… for Qwen3-0.6B-…), and when no family
 * matches, the SMALLEST mmproj — an unrelated 500MB projector must never
 * be fetched for a 400MB model. Returns undefined when the repo carries
 * no mmproj at all (a text-only model: no pair to promise).
 */
export function findProjectorFile<T extends { name: string; size: number }>(
  file: T,
  siblings: T[],
): T | undefined {
  const mmprojs = siblings.filter((s) =>
    s.name.toLowerCase().includes("mmproj"),
  );
  if (mmprojs.length === 0) return undefined;
  const family = file.name.replace(/[-_.]?(Q\d|q\d|F\d|f\d|B\d|b\d).*$/, "");
  return (
    mmprojs.find((m) => m.name.includes(family)) ??
    mmprojs.reduce((smallest, m) => (m.size < smallest.size ? m : smallest))
  );
}

export type PairDownloadStep = "main" | "projector" | "complete";

/** What a (re)start of this spec's download should do next.
 *
 * "main"      — the LLM isn't fully on disk: download it (normal path).
 * "projector" — the LLM is whole but the paired projector isn't: fetch
 *               only the projector (the retry path after a projector
 *               failure, and the handoff right after the main leg).
 * "complete"  — everything needed is already on disk: mark completed,
 *               never restart a full re-download of a finished file.
 */
export function pairDownloadStep(
  hasProjector: boolean,
  mainComplete: boolean,
  projectorComplete: boolean,
): PairDownloadStep {
  if (!mainComplete) return "main";
  if (hasProjector && !projectorComplete) return "projector";
  return "complete";
}
