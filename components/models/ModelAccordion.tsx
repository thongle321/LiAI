/** Collapsible model group (Ready to use / Available to download).
 *
 * @expo/ui's Collapsible owns the header — its `label` is a plain string,
 * so the count rides in the label rather than in a badge we can style. The
 * body stays ours: tier subheadings and preset cards are ordinary React
 * Native children, which the docs show composing directly.
 */

import type { ReactNode } from "react";
import { View } from "react-native";
import { Host, Collapsible } from "@expo/ui";

import { colors, font } from "../../themes/tokens.ts";

/** DESIGN.md Title (20/28, Medium) applied to the native header label. */
const HEADER_LABEL = {
  color: colors.primaryText,
  fontFamily: font.sansMedium,
  fontSize: 20,
  fontWeight: "500" as const,
  lineHeight: 28,
  letterSpacing: 0,
  textAlign: "left" as const,
};

export function ModelAccordion({
  title,
  count,
  open,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  open: boolean;
  /** Receives the native component's next state, not a bare toggle. */
  onToggle: (next: boolean) => void;
  children: ReactNode;
}) {
  return (
    <View className="mb-6">
      <Host matchContents={{ vertical: true }} style={{ width: "100%" }}>
        <Collapsible
          isOpen={open}
          onOpenChange={onToggle}
          label={`${title} (${count})`}
          labelStyle={HEADER_LABEL}
        >
          <View className="mt-3">{children}</View>
        </Collapsible>
      </Host>
    </View>
  );
}
