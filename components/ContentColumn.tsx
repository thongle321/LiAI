/** Centres a capped content column in the viewport (DESIGN.md).
 *
 * Chat is exempt — bubbles are edge-anchored, so this is for list and form
 * screens: models, settings, onboarding. Designed to sit inside a ScrollView
 * content container, so it centres itself rather than claiming flex height.
 */

import type { ReactNode } from "react";
import { useWindowDimensions, View } from "react-native";

import { contentColumnWidth } from "../lib/layout.ts";

export function ContentColumn({
  children,
  className,
}: {
  children: ReactNode;
  /** Extra classes for the column itself (padding, background). */
  className?: string;
}) {
  const { width } = useWindowDimensions();
  return (
    <View
      style={{ width: contentColumnWidth(width), alignSelf: "center" }}
      className={className}
    >
      {children}
    </View>
  );
}
