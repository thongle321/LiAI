/** Provider helpers: active-state predicates (pure, tested).
 *
 * Remote providers become active models with id `remote-<providerId>`
 * (see setActiveRemoteApi in the store). Centralized here so rows and
 * badges never re-implement the comparison — works for 1 or 100 providers.
 */

export function isProviderActive(
  activeModelId: string | null,
  providerId: string,
): boolean {
  return activeModelId === `remote-${providerId}`;
}

/** Compact param count for chips (135M, 0.5B, 1B). */
export function formatParams(n: number): string {
  const trim = (x: number) => `${Number(x.toFixed(1))}`;
  if (n >= 1_000_000_000) return `${trim(n / 1_000_000_000)}B`;
  if (n >= 1_000_000) return `${trim(n / 1_000_000)}M`;
  if (n >= 1_000) return `${trim(n / 1_000)}K`;
  return `${n}`;
}
