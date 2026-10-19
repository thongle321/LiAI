/** The first-run gate, as live state (store).
 *
 * This file is the canonical account of the bug; the other pieces point
 * here rather than restating it.
 *
 * WHY THIS EXISTS — the "You're set" buttons used to go nowhere.
 *
 * The root layout guards the drawer with `Stack.Protected guard={onboarded}`
 * (D1-1): while the gate is closed, the `(drawer)` group is not in the
 * navigator's route names AT ALL. The done screen used to call
 * `setOnboarded()`, which only wrote AsyncStorage — so the guard never
 * reopened, and a `router.replace("/chat")` aimed at a route the navigator
 * does not have is dropped rather than reported (StackRouter's
 * `getStateForAction` returns null for an unknown payload name, and React
 * Navigation bubbles the unhandled action up). The user pressed the button
 * and nothing happened.
 *
 * So the flag has to be LIVE state, not a value read once at mount: the
 * screen that completes onboarding and the navigator that must re-admit the
 * drawer are two different components, and they need one source of truth to
 * agree on when the drawer comes back.
 *
 * `exitTo` is the other half. The navigation cannot happen where the button
 * is pressed: the drawer is not back in the navigator until the layout has
 * re-rendered, and a replace fired in that window is dropped for the same
 * reason. So `complete()` records WHERE to go, and the root layout
 * (hooks/useOnboardingGate.ts) navigates once the navigator has caught up.
 */

import { create } from "zustand";

import { isOnboarded, setOnboarded } from "../services/onboarding.ts";

/** Where the done screen sends the user. Both destinations live inside the
 *  drawer, so both are behind the gate. */
export type OnboardingExit = "/chat" | "/models";

/** The persistence port, injected so the store is testable off-device. */
export interface OnboardingFlag {
  /** True once the user has finished onboarding. */
  read: () => Promise<boolean>;
  /** Record that the user has finished onboarding. */
  write: () => Promise<void>;
}

export interface OnboardingState {
  /** Whether the guarded screens may be shown. Optimistically true: most
   *  launches are returning users, and the splash covers the read. */
  onboarded: boolean;
  /** Whether the flag is settled — read from storage, or answered by
   *  `complete()`. */
  hydrated: boolean;
  /** Where to go once the gate re-opens. Consumed by the root layout. */
  exitTo: OnboardingExit | null;
  /** Read the persisted flag. Idempotent: the first caller reads, the rest
   *  share that read. */
  hydrate: () => Promise<void>;
  /** Persist the flag, open the gate and arm the destination. */
  complete: (to: OnboardingExit) => Promise<void>;
  /** Forget the destination, once it has been navigated to. */
  clearExit: () => void;
}

export function createOnboardingStore(flag: OnboardingFlag) {
  /** In-flight hydration, so concurrent callers share one read (the root
   *  layout mounts once, but StrictMode fires its effect twice). */
  let hydrating: Promise<void> | null = null;

  return create<OnboardingState>()((set, get) => ({
    onboarded: true,
    hydrated: false,
    exitTo: null,

    hydrate: () => {
      if (get().hydrated) return Promise.resolve();
      hydrating ??= (async () => {
        // A rejected read is treated as "not onboarded" — the same answer
        // services/onboarding.ts gives for a failed read. The catch keeps
        // `void hydrate()` from turning a broken port into an unhandled
        // rejection.
        const value = await flag.read().catch(() => false);
        // `complete()` may have landed while the read was in flight. It
        // knows the answer (true), so a late read must not close the gate
        // the user just opened.
        if (get().hydrated) return;
        set({ onboarded: value, hydrated: true });
      })().finally(() => {
        // Settled: the next caller may read again (a fresh store in a test,
        // a re-hydrate after a reset).
        hydrating = null;
      });
      return hydrating;
    },

    complete: async (to) => {
      // The gate opens FIRST. `flag.write()` is a disk round-trip, and a
      // stalled AsyncStorage must not leave the button looking dead — the
      // exact symptom this store exists to remove. `hydrated` too:
      // completing IS the answer, so a read still in flight must not
      // overwrite it.
      set({ onboarded: true, hydrated: true, exitTo: to });
      // The write is best-effort and never rejects: a failure means
      // onboarding shows once more on the next launch, which is the same
      // worst case services/onboarding.ts already accepts.
      await flag.write().catch(() => {});
    },

    clearExit: () => set({ exitTo: null }),
  }));
}

/** App singleton, backed on the persisted flag in services/onboarding.ts. */
export const useOnboardingStore = createOnboardingStore({
  read: isOnboarded,
  write: setOnboarded,
});
