/** The first-run gate, wired to the navigator.
 *
 * Mounted once, at the app root: it hydrates the flag and, when the done
 * screen arms a destination, performs the navigation.
 *
 * WHY THE NAVIGATION LIVES HERE — the drawer is not in the navigator while
 * the gate is closed (`Stack.Protected`, D1-1), so a replace aimed at it is
 * dropped. The gate re-opens on a state change, and the navigator only
 * re-admits the drawer when it re-renders — which happens in a LAYOUT
 * effect, before any passive effect runs. Navigating from a passive effect
 * here is therefore after the navigator has caught up; navigating from the
 * button press would be before it. (The full account is in
 * store/onboarding.ts.)
 *
 * The destination is cleared on OBSERVED arrival, not on dispatch: a
 * navigator that drops the action must not erase where the user was going.
 */

import { useEffect } from "react";
import { router, usePathname } from "expo-router";

import { useOnboardingStore } from "../store/onboarding.ts";

export function useOnboardingGate(): { onboarded: boolean } {
  const onboarded = useOnboardingStore((s) => s.onboarded);
  const exitTo = useOnboardingStore((s) => s.exitTo);
  const hydrate = useOnboardingStore((s) => s.hydrate);
  const clearExit = useOnboardingStore((s) => s.clearExit);
  const pathname = usePathname();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (exitTo === null) return;
    // Arrived: the path matches the destination, so the intent is spent.
    if (pathname === exitTo) {
      clearExit();
      return;
    }
    router.replace(exitTo);
  }, [exitTo, pathname, clearExit]);

  return { onboarded };
}
