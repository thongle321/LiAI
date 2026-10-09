/** One keyboard-state source for the whole app (store).
 *
 * WHY THIS EXISTS — the remaining "the empty card still moves" mechanism.
 * The tab bar and the chat screen BOTH react to the keyboard (the bar
 * unmounts, the screen compensates the column the bar vacates). Each used
 * to subscribe to useKeyboardState itself, in its own subtree, so the two
 * updates were not guaranteed to land in the same React commit: for a
 * frame or two the column had grown while the compensation had not, and a
 * vertically centred child shifts by half the bar slot. The geometry is
 * exact in source; the race was what survived the static fix.
 *
 * So there is ONE subscriber — KeyboardVisibilitySync in app/_layout.tsx,
 * mounted once under KeyboardProvider — writing here, and every consumer
 * reads this store: one notification, one batched commit, the bar's
 * unmount and the screen's compensation are simultaneous by construction.
 *
 * `tabBarHeight` is seeded from BottomNav's class-sum constant (TAB_BAR_HEIGHT
 * — its VALUE is device-verified, not test-verified) and replaced by the
 * bar's own onLayout measurement, so the compensation can no longer drift
 * when the bar's classes change. The guard lives in lib/keyboard.ts
 * (resolveTabBarHeight), node-testable there because this file must stay
 * free of React Native imports (see TAB_BAR_HEIGHT_SEED there).
 */

import { create } from "zustand";

import { TAB_BAR_HEIGHT_SEED, resolveTabBarHeight } from "../lib/keyboard.ts";

export interface KeyboardUIState {
  /** The keyboard is showing, for the whole app — not per screen. */
  isVisible: boolean;
  /** The bar's own rendered height, excluding the bottom safe-area inset
   *  (tabs)/_layout.tsx adds below it. Seeded from the class sum, then
   *  measured live. */
  tabBarHeight: number;
  setVisible: (visible: boolean) => void;
  setTabBarHeight: (height: number) => void;
}

export const useKeyboardStore = create<KeyboardUIState>()((set) => ({
  isVisible: false,
  tabBarHeight: TAB_BAR_HEIGHT_SEED,
  // A duplicate event must not notify: zustand skips listeners when the
  // updater returns the same state, and every consumer re-rendering on a
  // repeat keyboard tick is exactly the churn this store removes.
  setVisible: (visible) =>
    set((s) => (s.isVisible === visible ? s : { isVisible: visible })),
  setTabBarHeight: (height) =>
    set((s) => {
      const next = resolveTabBarHeight(s.tabBarHeight, height);
      return next === s.tabBarHeight ? s : { tabBarHeight: next };
    }),
}));
