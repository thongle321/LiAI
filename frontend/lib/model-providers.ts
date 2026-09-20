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
