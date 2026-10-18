/** Reads over a raw GGUF key-value header map.
 *
 * GGUF keys are architecture-prefixed: the header names its architecture
 * under `general.architecture`, and every model fact hangs off
 * `<arch>.<field>` beneath it. Values may arrive as strings, so they are
 * coerced — and anything unreadable reads as absent, never guessed.
 *
 * Pure: every input is a value, so jest covers it with hand-built
 * header maps. The native read that produces a header lives in
 * services/models//gguf-header.ts.
 */

import { positiveFinite } from "@/utils/guards.ts";

/** A raw GGUF header: `llama.rn`'s `loadLlamaModelInfo` result. */
export type GgufHeader = Record<string, unknown>;

/** The architecture the header declares, or undefined when it declares none. */
export function ggufArchitecture(header: GgufHeader): string | undefined {
  const arch = header["general.architecture"];
  return typeof arch === "string" && arch.length > 0 ? arch : undefined;
}

/** One `<arch>.<field>` value, coerced, or undefined when unreadable. */
function archValue(
  header: GgufHeader,
  arch: string,
  field: string,
): number | undefined {
  return positiveFinite(Number(header[`${arch}.${field}`]));
}

/** The model's maximum TRAINED context length.
 *
 * This is a property of the weights. It is not the server's configured
 * context setting on a remote endpoint (RemoteCaps.contextLength), which
 * says nothing about how far the model was trained.
 */
export function maxContextLength(header: GgufHeader): number | undefined {
  const arch = ggufArchitecture(header);
  return arch ? archValue(header, arch, "context_length") : undefined;
}

/** Flatten a header into the record ModelSpec.ggufMetadata stores.
 *
 * A hand-picked set of scalars, never the header verbatim: a real header
 * carries `tokenizer.ggml.tokens` (a quarter-million-entry string array)
 * and `general.file_data`, and persisting those would bloat AsyncStorage
 * for nothing. Only the fields the model card and the memory estimator
 * read survive.
 *
 * Undefined when the header declares no architecture — there is then no
 * prefix to resolve against, and guessing one would be a fabrication.
 */
export function ggufMetadataFromHeader(
  header: GgufHeader,
): Record<string, unknown> | undefined {
  const arch = ggufArchitecture(header);
  if (!arch) return undefined;
  const at = (field: string) => archValue(header, arch, field);

  const n_embd = at("embedding_length");
  const n_head = at("attention.head_count");
  // Most GGUFs omit the head dims precisely because they equal
  // n_embd / n_head — deriving them is the same value, not a guess, and
  // without it the KV-cache math has nothing to work from.
  const derivedHeadDim =
    n_embd !== undefined && n_head ? Math.floor(n_embd / n_head) : undefined;

  const record: Record<string, unknown> = { architecture: arch };
  const put = (name: string, value: number | undefined) => {
    if (value !== undefined) record[name] = value;
  };
  put("context_length", at("context_length"));
  put("n_layers", at("block_count"));
  put("n_embd", n_embd);
  put("n_head", n_head);
  put("n_head_kv", at("attention.head_count_kv") ?? n_head);
  put("n_vocab", at("vocab_size"));
  put("n_embd_head_k", at("attention.key_length") ?? derivedHeadDim);
  put("n_embd_head_v", at("attention.value_length") ?? derivedHeadDim);
  put("sliding_window", at("attention.sliding_window"));
  return record;
}
