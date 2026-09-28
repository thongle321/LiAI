/** Sampling parameters: what the model is allowed to do next (ADR-0013).
 *
 * Pure module on purpose — no store, no native import — so the defaults,
 * the clamping, and the global-vs-per-model precedence are all node-testable.
 * The values mirror PocketPal's CompletionSettings, which is where the
 * defaults came from; llama.rn's own defaults were never chosen, they were
 * inherited, and they suit neither chat nor roleplay.
 *
 * Two sentinels survive clamping and must never be "fixed":
 *   seed -1      random seed per request (llama.cpp default)
 *   nPredict -1  unlimited length; the value is the stop condition, not a cap
 */

export type MirostatMode = 0 | 1 | 2;

export interface SamplerParams {
  temperature: number;
  topK: number;
  topP: number;
  minP: number;
  typicalP: number;
  xtcThreshold: number;
  xtcProbability: number;
  penaltyLastN: number;
  penaltyRepeat: number;
  penaltyFrequency: number;
  penaltyPresence: number;
  mirostat: MirostatMode;
  mirostatTau: number;
  mirostatEta: number;
  seed: number;
  nPredict: number;
}

export const DEFAULT_SAMPLER: SamplerParams = {
  temperature: 0.7,
  topK: 40,
  topP: 0.95,
  minP: 0.05,
  typicalP: 1,
  xtcThreshold: 0.1,
  xtcProbability: 0,
  penaltyLastN: 64,
  penaltyRepeat: 1,
  penaltyFrequency: 0,
  penaltyPresence: 0,
  mirostat: 0,
  mirostatTau: 5,
  mirostatEta: 0.1,
  seed: -1,
  nPredict: -1,
};

/** Per-field ranges. A stored value is never trusted: it can be from an
 *  older build, a hand-edited file, or a half-written save. */
const RANGES = {
  temperature: [0, 2],
  topK: [0, 1000],
  topP: [0, 1],
  minP: [0, 1],
  typicalP: [0, 1],
  xtcThreshold: [0, 1],
  xtcProbability: [0, 1],
  penaltyLastN: [0, 65536],
  penaltyRepeat: [0, 2],
  penaltyFrequency: [0, 2],
  penaltyPresence: [0, 2],
  mirostatTau: [0, 10],
  mirostatEta: [0, 1],
  nPredict: [1, 8192],
} as const satisfies Record<string, readonly [number, number]>;

function num(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function intOr(value: unknown, fallback: number, min: number, max: number): number {
  return Math.round(num(value, fallback, min, max));
}

function mirostatOf(value: unknown, fallback: MirostatMode): MirostatMode {
  return value === 0 || value === 1 || value === 2 ? value : fallback;
}

/** Full parse of a persisted sampler. Anything unusable becomes the default. */
export function parseSampler(raw: unknown): SamplerParams {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_SAMPLER };
  }
  // The guard above proved it is a non-null, non-array object; the spread
  // then keeps only what it actually owns, so an inherited property cannot
  // set a single value.
  const v = { ...(raw as Record<string, unknown>) };
  const d = DEFAULT_SAMPLER;
  return {
    temperature: num(v.temperature, d.temperature, ...RANGES.temperature),
    topK: intOr(v.topK, d.topK, ...RANGES.topK),
    topP: num(v.topP, d.topP, ...RANGES.topP),
    minP: num(v.minP, d.minP, ...RANGES.minP),
    typicalP: num(v.typicalP, d.typicalP, ...RANGES.typicalP),
    xtcThreshold: num(v.xtcThreshold, d.xtcThreshold, ...RANGES.xtcThreshold),
    xtcProbability: num(v.xtcProbability, d.xtcProbability, ...RANGES.xtcProbability),
    penaltyLastN: intOr(v.penaltyLastN, d.penaltyLastN, ...RANGES.penaltyLastN),
    penaltyRepeat: num(v.penaltyRepeat, d.penaltyRepeat, ...RANGES.penaltyRepeat),
    penaltyFrequency: num(v.penaltyFrequency, d.penaltyFrequency, ...RANGES.penaltyFrequency),
    penaltyPresence: num(v.penaltyPresence, d.penaltyPresence, ...RANGES.penaltyPresence),
    mirostat: mirostatOf(v.mirostat, d.mirostat),
    mirostatTau: num(v.mirostatTau, d.mirostatTau, ...RANGES.mirostatTau),
    mirostatEta: num(v.mirostatEta, d.mirostatEta, ...RANGES.mirostatEta),
    seed: seedOf(v.seed, d.seed),
    nPredict: nPredictOf(v.nPredict, d.nPredict),
  };
}

/** -1 means "let the library pick"; 0 is a legal seed, so this cannot be a
 *  plain range clamp. */
function seedOf(value: unknown, fallback: number): number {
  if (value === -1) return -1;
  return intOr(value, fallback, 0, Number.MAX_SAFE_INTEGER);
}

/** -1 means unlimited, which is a different kind of value from any cap. */
function nPredictOf(value: unknown, fallback: number): number {
  if (value === -1) return -1;
  return intOr(value, fallback, ...RANGES.nPredict);
}

/** llama.rn's snake_case spelling of the sampler (CompletionParams in its
 *  lib/typescript/types.d.ts). Kept here, beside the values, so the mapping
 *  is testable and the engine wrapper stays a dumb forwarder. */
export interface LlamaSamplerParams {
  temperature: number;
  top_k: number;
  top_p: number;
  min_p: number;
  typical_p: number;
  xtc_threshold: number;
  xtc_probability: number;
  penalty_last_n: number;
  penalty_repeat: number;
  penalty_freq: number;
  penalty_present: number;
  mirostat: number;
  mirostat_tau: number;
  mirostat_eta: number;
  seed: number;
  n_predict: number;
}

export function toLlamaSampler(s: SamplerParams): LlamaSamplerParams {
  return {
    temperature: s.temperature,
    top_k: s.topK,
    top_p: s.topP,
    min_p: s.minP,
    typical_p: s.typicalP,
    xtc_threshold: s.xtcThreshold,
    xtc_probability: s.xtcProbability,
    penalty_last_n: s.penaltyLastN,
    penalty_repeat: s.penaltyRepeat,
    penalty_freq: s.penaltyFrequency,
    penalty_present: s.penaltyPresence,
    mirostat: s.mirostat,
    mirostat_tau: s.mirostatTau,
    mirostat_eta: s.mirostatEta,
    seed: s.seed,
    n_predict: s.nPredict,
  };
}

/** Per-model override: only the fields it actually sets win, and each one is
 *  clamped on the way through, so a bad override degrades to global rather
 *  than to a nonsense generation setting. */
export function resolveSampler(
  global: SamplerParams,
  override: Partial<SamplerParams> | null | undefined,
): SamplerParams {
  if (!override) return { ...global };
  const merged: Record<string, unknown> = { ...global };
  for (const key of Object.keys(DEFAULT_SAMPLER) as Array<keyof SamplerParams>) {
    if (Object.hasOwn(override, key)) merged[key] = override[key];
  }
  return parseSampler(merged);
}
