/** Keyboard geometry shared by every screen that avoids the keyboard.
 *
 * ONE function, consumed by everything that moves: the chat composer, the
 * jump-to-latest overlay, the vision panel. They must never disagree about
 * the arithmetic, or the screen reads as "the layout is drifting" when in fact
 * two parts are handling the keyboard differently. Note this is one shared
 * FUNCTION, not one shared value - each consumer derives its own, because
 * they anchor at different heights and so must rise by different amounts. This
 * mirrors pocketpal-ai's ChatView, which derives a single value and comments
 * on the same failure.
 *
 * PURE AND WORKLET-SAFE ON PURPOSE: this module imports nothing, so node can
 * load it and tests/keyboard.test.ts can test the geometry directly. The
 * Reanimated hook that consumes it lives in hooks/useKeyboardLift.ts, NOT
 * here, because node cannot load react-native-reanimated (it pulls in
 * react-native-worklets, which fails ESM resolution) and importing it would
 * take these tests down with it.
 */

/** How far a bottom-anchored view must rise for the keyboard to clear it.
 *
 * `height` is the raw value from react-native-keyboard-controller, which
 * NEGATES the native height (`heightSV.value = -event.height` in
 * KeyboardProvider), so it arrives negative while the keyboard is up — hence
 * the abs(). A bare `-height.value` in a translate would then move content
 * DOWN by the keyboard height, which is how the vision panel appeared to sink.
 *
 * `insetsBottom` is the view's own bottom ANCHOR — its distance above the
 * physical screen bottom — and it is the whole reason this takes an
 * argument. The keyboard height spans the navigation bar, so:
 *
 *   - a view anchored at the physical bottom must rise by the FULL
 *     height. Pass 0. (No tab screen has one today: the bar stays mounted
 *     under the keyboard, so its column bottoms out one bar slot up.)
 *   - a view anchored inside a tab column (the chat composer, the vision
 *     panel: `bottom` positions plus the lift) rests above the bar, which
 *     must pass the bar's slot (insets.bottom + measured tabBarHeight) so
 *     the sharp law `height MINUS anchor` lands the view exactly on the
 *     keyboard top. Passing 0 for such a view overshoots by the slot and
 *     leaves it floating above the keyboard — the old composer anchor bug.
 *
 * Getting this wrong is not subtle and was a real bug: the composer was
 * passing insets.bottom while anchored at 0, so it under-lifted by exactly
 * the navigation bar height — the reported "the chat input is not above the
 * keyboard". Note this is NOT the library subtracting an inset: no component
 * in react-native-keyboard-controller does that (KeyboardStickyView is
 * literally `translateY: height.value + offset`, and the native
 * EdgeToEdgeReactViewGroup suppresses its own bottom padding while the
 * controller is active to avoid double-spacing). It is our own anchor.
 */
export function keyboardOcclusion(height: number, insetsBottom = 0): number {
  // Called from inside useDerivedValue, which executes on the UI runtime.
  // Without this directive the UI thread tries to call a JS-thread function
  // and throws "[Worklets] Tried to synchronously call a Remote Function".
  // A no-op on the JS thread, so the node tests still call it directly.
  "worklet";
  return Math.max(0, Math.abs(height) - insetsBottom);
}

/** Seeded height of the tab bar, excluding the bottom safe-area inset.
 *
 * The CANONICAL definition is TAB_BAR_HEIGHT in
 * components/navigation/bottom-nav.tsx. This module is its only
 * re-declaration, and it exists because
 * BottomNav.tsx imports React Native and Uniwind: a store importing it for
 * one number drags the native type graph into the ambient program and
 * breaks the augmentation loading. One re-declaration, here, in the module
 * the geometry already lives in. The value is the bar's class sum at
 * DEFAULT font scale (listed on TAB_BAR_HEIGHT in BottomNav.tsx) — an
 * ESTIMATE the bar's own onLayout replaces, because the label scales with
 * the OS font setting up to 1.5x and a grown bar measures taller than any
 * fixed sum.
 *
 * Nothing machine-checks the two against each other: this comment used to
 * point at a `tests/keyboard-avoidance.test.ts` source scan that does not
 * exist, and `utils/__tests__/keyboard.test.ts` only asserts the seed is a
 * positive integer. A class-sum edit in BottomNav therefore drifts this
 * value silently. */
export const TAB_BAR_HEIGHT_SEED = 69;

/** The tab bar's measured height wins over the seeded class-sum constant —
 * but a nonsense measurement must never poison it.
 *
 * The bar's slot height is the chat screen's keyboard compensation
 * (keyboardOffset) AND the list's offset prop: a 0, negative or NaN there
 * under-compensates by exactly that much, and a vertically centred child
 * absorbs half of it as drift — the same failure mode as three disagreeing
 * copies of the constant (60 in code, 64 in prose, 75 real). An onLayout
 * can legitimately report 0 before first paint, so "reject, keep the
 * seeded value" is the only safe reading of a bad number. Pure so the
 * store's guard stays testable here — node can load this module, and it
 * cannot load a React Native component. */
export function resolveTabBarHeight(current: number, measured: number): number {
  if (!Number.isFinite(measured) || measured <= 0) return current;
  return measured;
}
