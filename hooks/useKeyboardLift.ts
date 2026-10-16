/** The one keyboard lift, shared by every view that rides above the keyboard.
 *
 * The chat composer, the jump-to-latest overlay and the vision bottom panel
 * each need to rise when the keyboard opens, and they must agree on HOW. They
 * do not rise the same DISTANCE, and that is not an inconsistency: each passes
 * its own bottom anchor (see below). What is shared is the arithmetic, so a
 * change to the geometry cannot land in one screen and miss the other. This
 * is the same "one reconciled value" rule pocketpal-ai's ChatView states in
 * its comments, reached by a different route: there the value is derived
 * once, here the function is.
 *
 * The library's own components each do this inline (KeyboardStickyView is
 * `translateY: height.value + offset`), which is why there is more than one
 * of them and why they can drift.
 *
 * The geometry itself lives in utils/keyboard.ts, deliberately: that module
 * imports nothing, so node can load it and its behaviour is unit-tested. This
 * one cannot be, because node cannot load react-native-reanimated.
 */

import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import { useAnimatedStyle, useDerivedValue } from "react-native-reanimated";

import { keyboardOcclusion } from "../utils/keyboard.ts";

/** Animated style that translates a bottom-anchored view up by the keyboard.
 *
 * `insetsBottom` MUST be the view's own bottom anchor, and 0 for anything
 * anchored at the physical screen bottom. Passing insets.bottom for such a
 * view is the bug that kept the chat composer under the keyboard: it is
 * anchored at 0, so it has to rise by the keyboard's full height. utils/keyboard.ts
 * explains the arithmetic; the short version is that the keyboard height
 * already spans the navigation bar.
 */
export function useKeyboardLift(insetsBottom = 0) {
  const keyboard = useReanimatedKeyboardAnimation();
  const occlusion = useDerivedValue(() =>
    keyboardOcclusion(keyboard.height.value, insetsBottom),
  );
  return useAnimatedStyle(() => ({
    transform: [{ translateY: -occlusion.value }],
  }));
}
