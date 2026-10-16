/** The selected/unselected radio glyph for a voice row.
 *
 * Two voice screens pick from a list — the System voice row and each
 * installed engine's voice rows — and a radio drawn twice is a radio that
 * drifts twice. It is a voice primitive, not generic settings chrome, so it
 * lives with the other voice parts rather than in settings-rows.tsx. */

import { View } from "react-native";

export function RadioDot({ checked }: { checked: boolean }) {
  return (
    <View className="h-5 w-5 items-center justify-center rounded-full border-2 border-border">
      {checked ? <View className="h-2.5 w-2.5 rounded-full bg-primary" /> : null}
    </View>
  );
}