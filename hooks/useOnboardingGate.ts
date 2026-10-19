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
 * The destination is spent on OBSERVED arrival, not on dispatch: a
 * navigator that drops the action must not erase where the user was going.
 * The rule is utils/onboarding-exit.ts; this hook only acts on it.
 */

import { useEffect, useRef, useState } from "react";
import { router, usePathname } from "expo-router";

import { decideOnboardingExit } from "../utils/onboarding-exit.ts";
import { useOnboardingStore } from "../store/onboarding.ts";

/** A replace that lands nowhere is re-issued on a tick, this long after
 * the last attempt, up to this many times. The navigator re-admits the
 * drawer in a layout effect, so the first attempt normally lands; the
 * retry covers the case where it does not, and the bound stops a
 * permanently unreachable destination from spinning forever. */
const RETRY_MS = 150;
const MAX_ATTEMPTS = 8;

export function useOnboardingGate(): { onboarded: boolean } {
  const onboarded = useOnboardingStore((s) => s.onboarded);
  const exitTo = useOnboardingStore((s) => s.exitTo);
  const hydrate = useOnboardingStore((s) => s.hydrate);
  const clearExit = useOnboardingStore((s) => s.clearExit);
  const pathname = usePathname();

  // The retry budget lives in a ref: it changes on every attempt, and
  // only the tick below has to force a re-render.
  const attempts = useRef(0);
  const armed = useRef<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (exitTo === null) {
      // Nothing armed: the next intent starts with a fresh budget.
      armed.current = null;
      attempts.current = 0;
      return;
    }
    if (armed.current !== exitTo) {
      armed.current = exitTo;
      attempts.current = 0;
    }
    if (decideOnboardingExit(pathname, exitTo) !== "replace") {
      // Arrived, or the user left the onboarding flow. Either way the
      // intent is spent — a stale one must never hijack a later
      // navigation.
      clearExit();
      return;
    }
    router.replace(exitTo);
    if (attempts.current >= MAX_ATTEMPTS) return;
    attempts.current += 1;
    const timer = setTimeout(() => setTick((t) => t + 1), RETRY_MS);
    return () => clearTimeout(timer);
  }, [exitTo, pathname, clearExit, tick]);

  return { onboarded };
}
