/** Estimated RAM need for a model, ported from PocketPal's
 * `utils/memoryEstimator.ts` formula (weights + KV cache + compute
 * buffer, × runtime overhead). Pure: every input is a value, so
 * jest covers it with hand-computed byte totals.
 *
 * LiAI's stored ggufMetadata is an untyped record, so callers map it
 * through `toMemoryMetadata` first — anything unparseable reads as
 * absent and the estimate falls back to weights × overhead, exactly like
 * PocketPal without metadata. The record is populated by
 * `readGgufMetadata` at download, import or reconcile time.
 */

/** The GGUF fields the math reads (subset of PocketPal's GGUFMetadata). */
export interface GgufMemoryMetadata {
  n_layers: number;
  n_embd: number;
  n_head: number;
  n_head_kv: number;
  n_vocab: number;
  n_embd_head_k: number;
  n_embd_head_v: number;
  sliding_window?: number;
}

export interface MemoryModel {
  /** Weight bytes (sum of file sizes). */
  size: number;
  gguf?: GgufMemoryMetadata;
}

export interface MemoryContext {
  nCtx: number;
  cacheK: string;
  cacheV: string;
  nUbatch: number;
  specDraftCacheK?: string;
  specDraftCacheV?: string;
}

// Sizes mirror llama.cpp's cache types.
export function getKVCacheTypeBytes(cacheType: string): number {
  const typeMap: Record<string, number> = {
    f32: 4.0,
    f16: 2.0,
    bf16: 2.0,
    q8_0: 1.0625, // 34/32
    q4_0: 0.5625, // 18/32
    q4_1: 0.625, // 20/32
    q5_0: 0.6875, // 22/32
    q5_1: 0.75, // 24/32
  };
  return typeMap[(cacheType || "f16").toLowerCase()] || 2.0; // Default to f16
}

// Guards against corrupt metadata: every required field must be a
// positive number (PocketPal's older persisted versions stored strings).
function isValidMetadata(metadata: GgufMemoryMetadata): boolean {
  const required = [
    metadata.n_layers,
    metadata.n_embd,
    metadata.n_head,
    metadata.n_head_kv,
    metadata.n_vocab,
    metadata.n_embd_head_k,
    metadata.n_embd_head_v,
  ];
  return required.every(
    (value) => typeof value === "number" && !isNaN(value) && value > 0,
  );
}

function calculateKVCacheMemory(
  metadata: GgufMemoryMetadata,
  ctx: MemoryContext,
): number {
  const n_layers = Number(metadata.n_layers);
  const n_embd_head_k = Number(metadata.n_embd_head_k);
  const n_embd_head_v = Number(metadata.n_embd_head_v);
  const n_head_kv = Number(metadata.n_head_kv);
  const sliding_window = metadata.sliding_window
    ? Number(metadata.sliding_window)
    : undefined;

  // For SWA (Sliding Window Attention) models like Gemma.
  const effectiveCtx = sliding_window
    ? Math.min(ctx.nCtx, sliding_window)
    : ctx.nCtx;

  // Key and value caches can carry different quantization.
  const bytesPerK = getKVCacheTypeBytes(ctx.cacheK || "f16");
  const bytesPerV = getKVCacheTypeBytes(ctx.cacheV || "f16");

  const keyCacheSize =
    n_layers * effectiveCtx * n_embd_head_k * n_head_kv * bytesPerK;
  const valueCacheSize =
    n_layers * effectiveCtx * n_embd_head_v * n_head_kv * bytesPerV;

  return keyCacheSize + valueCacheSize;
}

function calculateComputeBuffer(
  metadata: GgufMemoryMetadata,
  ctx: MemoryContext,
): number {
  const n_vocab = Number(metadata.n_vocab);
  const n_embd = Number(metadata.n_embd);
  return (n_vocab + n_embd) * ctx.nUbatch * 4;
}

/** Bridge from LiAI's untyped stored record to the estimator input.
 * Anything unparseable reads as absent — the estimator then falls back
 * to weights × overhead. */
export function toMemoryMetadata(
  record: Record<string, unknown> | undefined,
): GgufMemoryMetadata | undefined {
  if (!record) return undefined;
  return {
    n_layers: Number(record.n_layers),
    n_embd: Number(record.n_embd),
    n_head: Number(record.n_head),
    n_head_kv: Number(record.n_head_kv),
    n_vocab: Number(record.n_vocab),
    n_embd_head_k: Number(record.n_embd_head_k),
    n_embd_head_v: Number(record.n_embd_head_v),
    ...(record.sliding_window === undefined
      ? {}
      : { sliding_window: Number(record.sliding_window) }),
  };
}

const RUNTIME_OVERHEAD = 1.1;
const RUNTIME_OVERHEAD_WITHOUT_METADATA = 1.2;

export function estimateModelMemory(
  model: MemoryModel,
  projectionBytes?: number,
  draft?: MemoryModel,
  ctx?: MemoryContext,
): number {
  const mmProjSize = projectionBytes || 0;
  const draftSize = draft?.size || 0;

  // A paired draft runs with its own KV cache, sized by the target's
  // n_ctx — there is no separate draft n_ctx.
  let draftKvCacheSize = 0;
  if (draft?.gguf && ctx && isValidMetadata(draft.gguf)) {
    draftKvCacheSize = calculateKVCacheMemory(draft.gguf, {
      ...ctx,
      cacheK: ctx.specDraftCacheK || "f16",
      cacheV: ctx.specDraftCacheV || "f16",
    });
  }

  if (model.gguf && ctx && isValidMetadata(model.gguf)) {
    const weightsSize = model.size;
    const kvCacheSize = calculateKVCacheMemory(model.gguf, ctx);
    const computeBuffer = calculateComputeBuffer(model.gguf, ctx);

    const baseMemory = weightsSize + kvCacheSize + computeBuffer;
    return (
      baseMemory * RUNTIME_OVERHEAD +
      mmProjSize * RUNTIME_OVERHEAD +
      (draftSize + draftKvCacheSize) * RUNTIME_OVERHEAD
    );
  }

  return (model.size + mmProjSize + draftSize) * RUNTIME_OVERHEAD_WITHOUT_METADATA;
}
