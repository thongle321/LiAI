/** Is this model a DRAFT model rather than a chat model?
 *
 * PocketPal parity (`pocketpal-ai/src/utils/mtp.ts`): a draft model is a
 * speculative-decoding draft — an MTP head, an assistant head. It cannot
 * hold a conversation.
 *
 * The vision pairing heuristic could not tell the difference: a draft
 * repository carries an mmproj, so the model was classified as vision-
 * capable and the app downloaded a projector it can never use. The heal
 * (`store/models/vision-heal.ts`) undoes that.
 *
 * Pure: `utils/` may not reach for a native module, and nothing here
 * needs to — every input is a string.
 */

/** The GGUF architectures llama.cpp gives to draft models. */
export function isDraftOnlyArch(architecture?: string): boolean {
  return /[-_](assistant|mtp)$/.test((architecture ?? "").toLowerCase());
}

/** The filename heuristic — it decides only PRE-download.
 *
 * A filename convention must never override a valid chat architecture, so
 * this is the fallback for a model whose GGUF header we have not read (the
 * Hub search has no header to consult).
 *
 * "assistant" must match as a WHOLE token: "openassistant-…" is a real chat
 * model, and a substring match would mistake it for a draft. */
export function isDraftOnlyFilename(filename?: string): boolean {
  const name = (filename ?? "").toLowerCase().split("/").pop() ?? "";
  return name.startsWith("mtp-") || /(^|[-_.])assistant([-_.]|$)/.test(name);
}

/** The verdict for a model spec.
 *
 * The GGUF header is AUTHORITATIVE: a filename convention must never
 * override a valid chat architecture. The filename decides only
 * pre-download, where the Hub search has no header to consult.
 *
 * A header that names no architecture cannot classify the model at all,
 * and the filename must not stand in for it: the header was read, and what
 * it said was "I cannot tell". */
export function isDraftOnlySpec(spec: {
  ggufMetadata?: Record<string, unknown>;
  files?: { name: string }[];
}): boolean {
  const metadata = spec.ggufMetadata;
  if (metadata !== undefined) {
    const architecture = metadata.architecture;
    if (typeof architecture !== "string" || architecture === "") return false;
    return isDraftOnlyArch(architecture);
  }
  return isDraftOnlyFilename(spec.files?.[0]?.name);
}
