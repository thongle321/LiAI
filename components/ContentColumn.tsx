/** Centres a capped content column in the viewport (DESIGN.md).
 *
 * Chat is exempt — bubbles are edge-anchored, so this is for list and form
 * screens: models, settings, onboarding.
 *
 * The cap is `maxWidth`, never an explicit `width`. An explicit width equal
 * to the window overflows the moment any parent insets horizontally (a
 * landscape notch, the drawer, a nested ScrollView's own content width),
 * because it forces the column wider than the space actually available.
 * `width: '100%' + maxWidth` fills the container and only ever shrinks.
 */

import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { View } from "react-native";

/** Comfortable reading measure for a list/form column. On the 4px grid. */
const CONTENT_MAX_WIDTH = 640;

export function ContentColumn({
  children,
  className,
  style,
}: {
  children: ReactNode;
  /** Extra classes for the column itself (padding, background). */
  className?: string;
  /** Runtime-computed values (a stylesheet class cannot carry these). */
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[{ width: "100%", maxWidth: CONTENT_MAX_WIDTH, alignSelf: "center" }, style]}
      className={className}
    >
      {children}
    </View>
  );
}
