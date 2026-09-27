/** Keyboard geometry shared by every screen that avoids the keyboard.
 *
 * One reconciled value, derived once and consumed by everything that moves:
 * the chat composer stack, the vision panel. They must never disagree, or the
 * screen reads as "the layout is drifting" when in fact two parts are
 * handling the keyboard differently. This mirrors pocketpal-ai's ChatView,
 * which derives the same single value and comments on the same failure.
 */

/** How much of the chat surface the keyboard actually steals.
 *
 * `height` is the raw height reported by react-native-keyboard-controller,
 * which is NEGATIVE while the keyboard is up on some platforms — hence the
 * abs(). A bare `-height.value` in a translate then moves content DOWN by the
 * keyboard height, which is how the vision panel appeared to sink.
 *
 * `insetsBottom` is subtracted because the IME inset already spans the
 * navigation bar (KeyboardProvider runs with navigationBarTranslucent), so
 * subtracting it is what stops the overshoot. Clamped at zero: a keyboard
 * shorter than the inset must not translate the other way.
 */
export function keyboardOcclusion(height: number, insetsBottom: number): number {
  // Called from inside useDerivedValue, which executes on the UI runtime.
  // Without this directive the UI thread tries to call a JS-thread function
  // and throws "[Worklets] Tried to synchronously call a Remote Function".
  // A no-op on the JS thread, so the node tests still call it directly.
  "worklet";
  return Math.max(0, Math.abs(height) - insetsBottom);
}
