/** Shared input guards: the predicates several parsers need, once.
 *
 * `asRecord` existed as a private copy in three modules (model-upgrade,
 * remote-engine, remote-api) and the finite-positive rule in three more —
 * the C7 review flagged both as Duplicated Code. One shape, called from
 * every site; domain names (`normalizeTimeoutMs`) alias it where a rule
 * has a name of its own. */

/** A plain object record, or null for anything else (arrays included). */
export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Finite and positive, else undefined — a usable measured number.
 *  Absent, zero, negative, NaN and Infinity are all "unset", never 0. */
export function positiveFinite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}
