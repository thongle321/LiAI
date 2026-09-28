/** Which Hugging Face token is actually sent.
 *
 * Pure, because the model store is a singleton with no injectable storage —
 * the one store that cannot be built in a test — so a testable seam has to
 * sit below it. The store method is a thin wrapper over this.
 *
 * The rule: an explicitly supplied token always wins, because a caller
 * passing one means it. Otherwise the stored token is sent only while the
 * "Use HF Token" switch is on. Parking a token that is causing 401s without
 * deleting it is the whole point of the switch.
 */

export interface HfTokenState {
  hfToken: string | null;
  useHfToken: boolean;
}

export function activeHfToken(
  state: HfTokenState,
  override?: string | null,
): string | null {
  if (override !== undefined && override !== null && override !== "") {
    return override;
  }
  return state.useHfToken ? state.hfToken : null;
}
