/** One keyboard-state source for the whole app (store).
 *
 * WHY THIS EXISTS — the keyboard's effects used to be two coordinated
 * JS-thread steps (the tab bar unmounted on open, the chat screen
 * compensated the column the bar vacated) whose updates could land in
 * different React commits. So there is ONE subscriber — KeyboardVisibilitySync
 * in app/_layout.tsx, mounted once under KeyboardProvider — writing here,
 * and every consumer reads this store: one notification, one batched commit.
 *
 * The steps are gone for good (bar stays mounted; every lift is a Reanimated
 * translateY), and what survives is the BROADCAST: screens that still need
 * to know the flag get it without each subscribing to the library's
 * context, and `tabBarHeight` is the one measured anchor value every
 * bottom-anchored lift reads (see useKeyboardLift's anchor).
 *
 * `tabBarHeight` is seeded from BottomNav's class-sum constant (TAB_BAR_HEIGHT
 * — its VALUE is device-verified, not test-verified) and replaced by the
 * bar's own onLayout measurement, so the anchor can no longer drift
 * when the bar's classes change. The guard lives in utils/keyboard.ts
 * (resolveTabBarHeight), node-testable there because this file must stay
 * free of React Native imports (see TAB_BAR_HEIGHT_SEED there).
 */

import { create } from "zustand";

import { TAB_BAR_HEIGHT_SEED, resolveTabBarHeight } from "@/utils/keyboard.ts";

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
