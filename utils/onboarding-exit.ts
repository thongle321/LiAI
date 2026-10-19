/** What the armed onboarding destination should do next.
 *
 * The first-run gate arms a destination when the done screen is pressed.
 * That intent has exactly three outcomes, and deciding them here — pure,
 * with no device import — keeps the rule testable and keeps the hook that
 * acts on it small:
 *
 * - `arrive` — the path IS the destination. The intent is spent.
 * - `abandon` — the user has left the onboarding flow. The intent is
 *   dropped: a stale destination must never hijack a later navigation.
 * - `replace` — the user is still in the flow, so the navigation is
 *   (re-)issued. The hook re-issues it on a tick, because a replace that
 *   lands nowhere would otherwise be forgotten with the button dead.
 */

export type OnboardingExitDecision = "arrive" | "abandon" | "replace";

/** The path the onboarding flow lives under (app/onboarding/*). */
const ONBOARDING_PREFIX = "/onboarding";

export function decideOnboardingExit(
  pathname: string,
  exitTo: string,
): OnboardingExitDecision {
  if (pathname === exitTo) return "arrive";
  if (!pathname.startsWith(ONBOARDING_PREFIX)) return "abandon";
  return "replace";
}
