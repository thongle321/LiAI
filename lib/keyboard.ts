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
 * `insetsBottom` is the view's own bottom ANCHOR, and it is the whole reason
 * this takes an argument. The keyboard height spans the navigation bar, so:
 *
 *   - a view anchored at the physical bottom (the chat composer:
 *     `absolute inset-x-0 bottom-0`) must rise by the FULL height. Pass 0.
 *   - a view anchored above the nav bar (the vision panel, positioned with
 *     `style={[{ bottom }, liftStyle]}` where `bottom` is the anchor its
 *     caller passed - `app/vision.tsx` sends `insets.bottom + 12`) must rise
 *     by height MINUS that anchor, or it overshoots and floats a gap above
 *     the keyboard.
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
