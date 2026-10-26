/** The voice tab's corner Eye sits below the status bar (bug report).
 *
 *  The Eye was absolutely positioned with `top-2` inside the screen's
 *  SafeAreaView; on the device it rendered under the system status bar —
 *  visually overlapped AND untappable (the status bar wins touches).
 *  The fix anchors it to the measured top inset, the same radius the
 *  vision-mode top float uses (commit eed8767 padded the top edge there).
 */

import { readSource } from "@/jest/source.ts";

const src = readSource("app/(drawer)/(tabs)/voice.tsx");

describe("voice tab's corner Eye", () => {
  it("anchors to the measured top inset, not a fixed offset", () => {
    // The class-only `top-2` variant is what broke the status bar.
    expect(src).not.toMatch(/absolute\s+top-2\s+right-4/);
    expect(src).toMatch(/insets\.top/);
    expect(src).toMatch(/useSafeAreaInsets\(\)/);
  });
});
