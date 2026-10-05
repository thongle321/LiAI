/** Pure formatting/selection rules for the Hugging Face add-model flow,
 * ported from PocketPal (utils/index.ts, formatters.ts, modelSettings.ts,
 * HFStore.getSortParams) so the screen reads identically. No I/O, no
 * React — everything here is unit-tested in tests/hf-format.test.ts.
 */

import { findProjectorFile } from "./vision-pairing.ts";

/** "lmstudio-community/Qwen3-0.6B-GGUF" → "Qwen3-0.6B" */
export function extractHFModelTitle(modelId: string): string {
  const sanitized = modelId.replace(/[-_]?[Gg][Gg][Uu][Ff]$/, "");
  if (!sanitized.includes("/")) return sanitized;
  const match = sanitized.match(/^([^/]+)\/(.+)$/);
  return match ? match[2] : "Unknown";
}

/** 1500 → "1.5K". Mirrors PocketPal's formatter including the
 * trailing-zero strip; `uppercase` picks the cap, `withSpace` the gap. */
export function formatNumber(
  num: number,
  fractionDigits = 2,
  uppercase = true,
  withSpace = false,
): string {
  const suffix = uppercase ? "KMB" : "kmb";
  const gap = withSpace ? " " : "";
  const trim = (v: number) => v.toFixed(fractionDigits).replace(/\.?0+$/, "");
  if (num < 1000) return num.toString();
  if (num < 1e6) return `${trim(num / 1e3)}${gap}${suffix[0]}`;
  if (num < 1e9) return `${trim(num / 1e6)}${gap}${suffix[1]}`;
  return `${trim(num / 1e9)}${gap}${suffix[2]}`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/** Largest whole unit, floored — "3 days ago", and PocketPal's two
 * wordings (list rows are short, detail chips are long). */
export function timeAgo(value: string | number, now = Date.now(), long = false): string {
  const at = typeof value === "number" ? value : Date.parse(value);
  if (Number.isNaN(at)) return long ? "Updated unknown" : "unknown";
  const elapsed = Math.max(0, now - at);
  if (elapsed < MINUTE) return long ? "Updated just now" : "just now";
  const [count, unit] =
    elapsed < HOUR
      ? [Math.floor(elapsed / MINUTE), "minute"]
      : elapsed < DAY
        ? [Math.floor(elapsed / HOUR), "hour"]
        : elapsed < WEEK
          ? [Math.floor(elapsed / DAY), "day"]
          : elapsed < MONTH
            ? [Math.floor(elapsed / WEEK), "week"]
            : elapsed < YEAR
              ? [Math.floor(elapsed / MONTH), "month"]
              : [Math.floor(elapsed / YEAR), "year"];
  const text = `${count} ${unit}${count === 1 ? "" : "s"} ago`;
  // Detail chips read "Updated 3 days ago"; list rows read the bare form.
  return long ? `Updated ${text}` : text;
}

/** The K-quants with half attention PocketPal warns about. */
export function isLegacyQuantization(fileName: string): boolean {
  return ["Q4_0_4_8", "Q4_0_4_4", "Q4_0_8_8"].some((q) =>
    fileName.toLowerCase().includes(q.toLowerCase()),
  );
}

export type HFSortBy = "relevance" | "downloads" | "lastModified" | "likes";

/** Relevance is the Hub's own order: no sort parameter at all. */
export function hfSortParams(
  sortBy: HFSortBy,
): { sort?: string; direction?: string } {
  return sortBy === "relevance" ? {} : { sort: sortBy, direction: "-1" };
}

/** `Link: <url>; rel="next"` → that url, else null (last page). */
export function nextPageFromLink(header: string | null): string | null {
  if (!header) return null;
  const next = header
    .split(",")
    .map((part) => part.trim())
    .find((part) => part.includes('rel="next"'));
  const match = next?.match(/<(.*)>/);
  return match ? match[1] : null;
}

/** Is this search hit a multimodal model? PocketParity: the details header
 *  shows a vision tag, decided from the Hub's own tags, with a projector
 *  file in the siblings as the fallback when a repo is untagged. */
export function isVisionModel(
  tags: string[],
  fileNames: string[],
): boolean {
  const tagged = tags.some((t) => {
    const tag = t.toLowerCase();
    // The Hub's own spelling is image-text-to-text, not image-text.
    return tag === "vision" || tag === "multimodal" || tag.startsWith("image-text");
  });
  return (
    tagged || fileNames.some((n) => n.toLowerCase().includes("mmproj"))
  );
}

export interface VisionSize {
  llmSize: number;
  /** The mmproj paired with this LLM, when the repo has one. */
  mmprojSize: number | null;
  /** What the card prints: the pair's combined footprint. */
  total: number;
  isVision: boolean;
}

/** A vision model's real footprint is the LLM PLUS its projector. The
 * pairing rule itself lives in lib/models/vision-pairing.ts (family
 * prefix, smallest-matching fallback) and is shared with the downloader
 * so the card's promise and the fetch can never drift. */
export function visionSizeBreakdown(
  file: { name: string; size: number },
  siblings: { name: string; size: number }[],
): VisionSize {
  const paired = findProjectorFile(file, siblings);
  if (paired === undefined) {
    return { llmSize: file.size, mmprojSize: null, total: file.size, isVision: false };
  }
  return {
    llmSize: file.size,
    mmprojSize: paired.size,
    total: file.size + paired.size,
    isVision: true,
  };
}