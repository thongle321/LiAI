/** Hugging Face model source: presets, search, file listing, spec builders.
 *
 * Plain functions — no strategy interface/registry (there is exactly one
 * Hugging Face source, so the indirection bought nothing). Spec ids stay
 * stable for persisted-state upgrades:
 *   preset-<presetId>-<fileName>   hf-<modelId>-<fileName>
 */

import type {
  ModelSpec,
  ModelType,
  PresetModel,
  PresetModelFile,
  HFModelSearchResult,
  HFModelFile,
} from "@/types/models";

import {
  hfSortParams,
  isVisionModel,
  nextPageFromLink,
  type HFSortBy,
} from "./hf-format.ts";
import { mmprojSiblings } from "./vision-pairing.ts";
import { PRESETS } from "@/constants/presets.ts";
import { isRetryableStatus, MAX_ATTEMPTS, retryAfterMs } from "./http-retry.ts";

const HF_HUB_BASE = "https://huggingface.co";
const HF_API_BASE = "https://huggingface.co/api";

/** Ceiling on any single Hub request, so a stalled socket cannot leave the
 * search spinner up forever. */
const HUB_TIMEOUT_MS = 15000;

/** Our attribution for outbound Hugging Face requests (PocketPal parity:
 * they send PocketPal/<v>; HF's CDN refuses anonymous clients).
 * Version mirrors app.json — bump together. */
export const HF_USER_AGENT = "LiAI/1.0.0";

/** Wire shape of the HF browse proxy (verbatim HF rows we actually read). */
interface HFSearchItem {
  modelId: string;
  cardData?: { description?: string };
  tags?: string[];
  downloads?: number;
  likes?: number;
  private?: boolean;
  gated?: boolean | string;
  lastModified?: string;
  trendingScore?: number;
}

/** Wire shape of the HF tree proxy (verbatim HF rows we actually read). */
interface HFTreeItem {
  type?: string;
  path: string;
  size?: number;
  /** LFS rows carry the true byte size and the content id a bookmark
   * is remembered by (`oid`). */
  lfs?: { size?: number; oid?: string };
}

/** Everything the spec builder needs about a repo, independent of search. */
export interface HFModelRef {
  modelId: string;
  author: string;
  name: string;
  description: string;
  /** Hub tags + sibling files when the ref came from a search result.
   *  Absent for a bare id (hfRefFromId) — the vision facts are then
   *  unknowable, never guessed. */
  tags?: string[];
  siblings?: HFModelFile[];
}


export async function getPresets(): Promise<PresetModel[]> {
  return PRESETS;
}

/** Caller abort plus our own ceiling. AbortSignal.any keeps both; where it
 * is missing (older Hermes) we keep the caller's signal alone, because
 * dropping the 15s timeout is survivable while ignoring a supersede is not. */
function hubSignal(external?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(HUB_TIMEOUT_MS);
  if (!external) return timeout;
  return typeof AbortSignal.any === "function"
    ? AbortSignal.any([external, timeout])
    : external;
}

/** A Hub failure the UI can act on: 401/403 is `authentication`, which is
 * what surfaces the "Disable Token & Retry" escape hatch (PocketPal
 * carries the same code on its ErrorState). */
export class HfError extends Error {
  // An explicit field, NOT a constructor parameter property: node's
  // strip-only type stripping (jest) rejects parameter properties.
  readonly code: "authentication" | "network" | "unknown";

  constructor(message: string, code: "authentication" | "network" | "unknown") {
    super(message);
    this.name = "HfError";
    this.code = code;
  }
}

interface HubPage {
  rows: unknown[];
  /** The `Link: …; rel="next"` URL, when there is a next page. */
  link: string | null;
}

/** Waits out a retry backoff, but gives up the moment the caller aborts —
 *  a superseded search must not sit in a backoff timer. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const done = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener("abort", done, { once: true });
  });
}

/** One Hub GET, riding the download path's retry policy: a 429 or 5xx is
 *  the server asking for time, and search would otherwise die on a single
 *  tick. Each attempt builds its own signal, so a slow retry still gets a
 *  fresh ceiling. 4xx is a fact about the request and never retries. */
async function hubRequest(
  url: string,
  headers: Record<string, string>,
  fallback: string,
  externalSignal?: AbortSignal,
): Promise<Response> {
  for (let attempt = 0; ; attempt += 1) {
    let resp: Response;
    try {
      resp = await fetch(url, {
        method: "GET",
        headers,
        signal: hubSignal(externalSignal),
      });
    } catch (error) {
      // The UI renders this message verbatim, so the raw fetch text
      // ("Network request failed", "The operation was aborted") must not
      // escape. Keep it in the log, hand the screen the clean fallback.
      //
      // A transport failure is the one the user can act on by reconnecting
      // (D3-15), so the copy says so rather than restating the operation.
      console.warn(`[huggingface] ${fallback}:`, error);
      throw new HfError(`${fallback} — check your connection`, "network");
    }
    if (!isRetryableStatus(resp.status) || attempt === MAX_ATTEMPTS - 1) return resp;
    await sleep(retryAfterMs(resp.headers, attempt), externalSignal);
  }
}

async function hubFetch(
  url: string,
  token: string | undefined,
  fallback: string,
  externalSignal?: AbortSignal,
): Promise<HubPage> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": HF_USER_AGENT,
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const resp = await hubRequest(url, headers, fallback, externalSignal);
  if (resp.status === 401 || resp.status === 403) {
    throw new HfError("check your Hugging Face token", "authentication");
  }
  if (!resp.ok) throw new HfError(fallback, "unknown");
  let data: unknown;
  try {
    data = await resp.json();
  } catch {
    throw new HfError(fallback, "unknown");
  }
  if (!Array.isArray(data)) throw new HfError(fallback, "unknown");
  return { rows: data, link: nextPageFromLink(resp.headers.get("Link")) };
}

/** Direct Hub GET: Bearer token header, verbatim JSON list, Error surfacing. */
async function hubGet<T>(
  url: string,
  token: string | undefined,
  fallback: string,
  externalSignal?: AbortSignal,
): Promise<T[]> {
  // SAFETY: Array.isArray proves list shape at runtime; T only documents
  // which verbatim Hub row fields the mapper below reads (no coercion).
  return (await hubFetch(url, token, fallback, externalSignal)).rows as T[];
}

export interface HFSearchOptions {
  author?: string;
  sortBy?: HFSortBy;
  /** A `Link` URL from a previous page; fetches that page instead. */
  pageUrl?: string;
}

export interface HFSearchPage {
  results: HFModelSearchResult[];
  nextPageLink: string | null;
}

/** PocketPal parity: an EMPTY query is still a search — the Hub answers
 * with its default (relevance) listing, which is what the sheet shows
 * before you type. `author` and `sortBy` carry the filter-sheet values. */
export async function searchModels(
  query: string,
  token?: string,
  signal?: AbortSignal,
  options: HFSearchOptions = {},
): Promise<HFSearchPage> {
  const { author, sortBy = "relevance", pageUrl } = options;
  const url =
    pageUrl ??
    (() => {
      const params = new URLSearchParams({
        search: query.trim(),
        // conversational keeps chat-tuned GGUFs in; full/config bring
        // the row data the details view reads.
        filter: "gguf,conversational",
        full: "true",
        config: "true",
        limit: "10",
        ...hfSortParams(sortBy),
      });
      if (author?.trim()) params.set("author", author.trim());
      return `${HF_API_BASE}/models?${params}`;
    })();
  const { rows, link } = await hubFetch(url, token, "Search failed", signal);
  // No visibility filter: HF scopes results to what the token may see,
  // and gated rows are downloadable now that downloads carry the token.
  const results = (rows as HFSearchItem[]).map((m) => ({
    modelId: m.modelId,
    author: m.modelId.split("/")[0],
    name: m.modelId.split("/")[1],
    description: m.cardData?.description || "",
    tags: m.tags || [],
    downloads: m.downloads || 0,
    likes: m.likes || 0,
    gated: Boolean(m.gated),
    lastModified: m.lastModified,
    trendingScore: m.trendingScore || 0,
    ggufFiles: [],
  }));
  return { results, nextPageLink: link };
}

/** recursive=true so projector files nested in subfolders show up —
 * the vision size breakdown pairs an LLM with its mmproj. `oid` is the
 * identity a bookmark is remembered by. */
export async function getModelFiles(
  modelId: string,
  token?: string,
): Promise<HFModelFile[]> {
  if (modelId.trim() === "") return [];
  const data = await hubGet<HFTreeItem>(
    `${HF_API_BASE}/models/${modelId.trim()}/tree/main?recursive=true`,
    token,
    "Failed to fetch model files",
  );
  return data
    .filter((f) => f.type === "file" && f.path.toLowerCase().endsWith(".gguf"))
    .map((f) => ({
      name: f.path.split("/").pop() || f.path,
      size: f.lfs?.size ?? f.size ?? 0,
      path: f.path,
      downloadUrl: hfDownloadUrl(modelId, f.path),
      oid: f.lfs?.oid,
    }));
}

/** GGUF specs (`?expand[]=gguf`) are NOT requested: nothing in the file
 * card or the details header reads a parameter count, so the extra
 * round trip per opened repo would buy nothing. Sizes come from the
 * sibling LFS metadata above. */

export function hfDownloadUrl(modelId: string, path: string): string {
  // Encode each segment but keep the separators: a repo can nest GGUFs in a
  // folder, and a filename with a space in it is otherwise a broken request.
  // Decoding first keeps an already-encoded segment from doubling up.
  const encoded = path
    .split("/")
    .map((seg) => {
      try {
        return encodeURIComponent(decodeURIComponent(seg));
      } catch {
        return encodeURIComponent(seg);
      }
    })
    .join("/");
  return `${HF_HUB_BASE}/${modelId}/resolve/main/${encoded}`;
}

/**
 * PocketPal parity: the HF token only ever leaves the device for huggingface.co.
 *
 * Exactly that host. A suffix match also accepts "evil-huggingface.co" and
 * "huggingface.co.attacker.net", which would post the user's token to whoever
 * registered the lookalike — and this predicate is the only thing standing
 * between a redirect and that leak.
 */
export function isHuggingFaceUrl(url: string): boolean {
  try {
    return new URL(url).hostname === "huggingface.co";
  } catch {
    return false;
  }
}

/** Best-effort repo metadata when a search result is no longer cached. */
export function hfRefFromId(modelId: string): HFModelRef {
  const [author, ...rest] = modelId.split("/");
  return { modelId, author, name: rest.join("/") || modelId, description: "" };
}

export function hfRefFromSearch(result: HFModelSearchResult): HFModelRef {
  return {
    modelId: result.modelId,
    author: result.author,
    name: result.name,
    description: result.description,
    tags: result.tags,
    siblings: result.ggufFiles,
  };
}

function inferModelType(fileName: string): ModelType {
  const name = fileName.toLowerCase();
  if (name.includes("vision") || name.includes("mmproj") || name.includes("clip")) {
    return "vision";
  }
  if (name.includes("projection") || name.includes("mmproj")) {
    return "projection";
  }
  return "llm";
}

/** Stable spec id for a preset file (persisted-state upgrades rely on it). */
export function presetSpecId(presetId: string, fileName: string): string {
  return `preset-${presetId}-${fileName}`;
}

/** Stable spec id for a search-result file (mirrors buildHfModelSpec). */
export function hfSpecId(modelId: string, fileName: string): string {
  return `hf-${modelId}-${fileName}`;
}

export function buildHfModelSpec(ref: HFModelRef, file: HFModelFile): ModelSpec {
  // Vision facts recorded ONCE here, so the card's toggle, the selector and
  // the downloader all read the same answer instead of re-deriving it (the
  // old filename-derived `type` misses repos like `gemma-3-4b-it`).
  const siblings = ref.siblings;
  const supportsVision =
    siblings !== undefined
      ? isVisionModel(ref.tags ?? [], siblings.map((f) => f.name))
      : false;
  const projectorCandidates = mmprojSiblings(siblings ?? []).map((f) => ({
    name: f.name,
    size: f.size,
    downloadUrl: f.downloadUrl,
  }));
  return {
    id: hfSpecId(ref.modelId, file.name),
    name: `${ref.name} (${file.name})`,
    author: ref.author,
    description: ref.description,
    origin: "huggingface",
    type: inferModelType(file.name),
    supportsVision,
    ...(supportsVision ? { visionEnabled: true } : {}),
    ...(projectorCandidates.length > 0 ? { projectorCandidates } : {}),
    hfUrl: `https://huggingface.co/${ref.modelId}`,
    files: [
      { name: file.name, size: file.size, downloadUrl: file.downloadUrl, oid: file.oid },
    ],
    downloadStatus: "idle",
    downloadProgress: 0,
    downloadedBytes: 0,
    totalBytes: file.size,
  };
}

export function buildPresetModelSpec(
  preset: PresetModel,
  file: PresetModelFile,
): ModelSpec {
  return {
    id: presetSpecId(preset.id, file.name),
    name: `${preset.name} (${file.name})`,
    author: preset.author,
    description: preset.description,
    origin: "preset",
    type: preset.type,
    params: preset.params,
    capabilities: preset.capabilities,
    files: [
      { name: file.name, size: file.size, downloadUrl: file.downloadUrl },
    ],
    downloadStatus: "idle",
    downloadProgress: 0,
    downloadedBytes: 0,
    totalBytes: file.size,
  };
}
