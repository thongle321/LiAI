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

import { keyboardOcclusion } from "@/utils/keyboard.ts";

/** Animated style that translates a bottom-anchored view up by the keyboard.
 *
 * `insetsBottom` MUST be the view's own bottom anchor — its distance above
 * the physical screen bottom. 0 is right ONLY when the view rests on the
 * physical bottom; anything anchored inside a tab column rests above the
 * tab bar, which stays mounted while the keyboard opens, so it must pass
 * the bar's slot (insets.bottom + measured tabBarHeight) or it rises a full
 * slot too far and floats above the keyboard. utils/keyboard.ts explains
 * the arithmetic; the short version is that the keyboard height already
 * spans the navigation bar.
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
