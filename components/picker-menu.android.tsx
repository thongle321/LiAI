/** Android popup for PickerRow: Material 3 ExposedDropdownMenuBox.
 *
 * NOT @expo/ui's universal Picker. On Android that renders an
 * ExposedDropdownMenuBox whose anchor is a TextField, and an M3 text field
 * carries a 56dp minimum height — which made every settings row ~56dp tall
 * with dead space above and below the control. The `appearance` prop is
 * ignored on Android outright ("Material 3 has no wheel-style picker").
 * @expo/ui's own docs say the anchor may be "e.g. TextField or Text", so
 * this uses a Text: same native popup, same seeded Material colours, no
 * minimum height, and the row goes back to being sized by its own label.
 *
 * Two shapes (variant):
 * - "text" (default): the compact right-side trigger PickerRow uses. The
 *   Host is content-sized (matchContents) so it never stretches the row.
 * - "outlined": PocketPal's Selector trigger — a full-width boxed control,
 *   the same width whether a value is selected or the placeholder shows —
 *   used where the picker stands alone in a column (sheets). The anchor Row
 *   fills the box width, so the popup is anchored to the field's full
 *   width instead of the value text, and the chevron sits inside the box.
 */

import { useState } from "react";
import { Pressable } from "react-native";
import { Host } from "@expo/ui";
import {
  DropdownMenuItem,
  ExposedDropdownMenu,
  ExposedDropdownMenuBox,
  Row,
  Text as ComposeText,
} from "@expo/ui/jetpack-compose";
import {
  defaultMinSize,
  fillMaxWidth,
  menuAnchor,
} from "@expo/ui/jetpack-compose/modifiers";

import { ChevronDown } from "lucide-react-native";

import { useColors, useColorScheme, typeScale } from "@/themes/tokens.ts";
import type { PickerMenuProps } from "./picker-menu";

export function PickerMenu<T extends string>({
  label,
  options,
  value,
  onChange,
  show,
  variant = "text",
}: PickerMenuProps<T>) {
  const colors = useColors();
  const scheme = useColorScheme();
  const [open, setOpen] = useState(false);
  const outlined = variant === "outlined";

  const box = (
    <ExposedDropdownMenuBox expanded={open} onExpandedChange={setOpen}>
      {/* The anchor the popup positions against, and the only thing Compose
          draws in the row. */}
      <Row
        verticalAlignment="center"
        horizontalArrangement={outlined ? "start" : "end"}
        modifiers={[menuAnchor(), ...(outlined ? [fillMaxWidth()] : [])]}
      >
        {/* maxLines={1} + ellipsis: device voice names run long
            ("Microsoft Zira Desktop - English (United States)"). Without a
            cap the anchor wraps and the whole row grows, which is the same
            class of defect as the 56dp text field this replaced. The MENU
            items below stay unwrapped — that is where the user actually
            reads a long name. */}
        <ComposeText
          color={colors.secondaryText}
          style={{ fontSize: typeScale.bodyMd.size }}
          maxLines={1}
          overflow="ellipsis"
        >
          {show(value)}
        </ComposeText>
      </Row>
      <ExposedDropdownMenu
        expanded={open}
        onDismissRequest={() => setOpen(false)}
        // A Material 3 ExposedDropdownMenu sizes itself to its anchor, and
        // on the compact trigger this anchor is a short value ("Tavily").
        // That left the popup a few characters wide and wrapped every
        // option into a one-word-per-line column. The floor is set on the
        // menu rather than the anchor so the row keeps its own compact
        // width; long names still grow it, because this is a minimum, not
        // a fixed size.
        modifiers={[defaultMinSize({ minWidth: 200 })]}
      >
        {options.map((option) => (
          <DropdownMenuItem
            key={option}
            onClick={() => {
              onChange(option);
              setOpen(false);
            }}
          >
            <DropdownMenuItem.Text>
              <ComposeText color={colors.primaryText} style={{ fontSize: typeScale.bodyMd.size }}>
                {show(option)}
              </ComposeText>
            </DropdownMenuItem.Text>
          </DropdownMenuItem>
        ))}
      </ExposedDropdownMenu>
    </ExposedDropdownMenuBox>
  );

  if (!outlined) {
    return (
      <Pressable
        onPress={() => setOpen((o) => !o)}
        className="min-h-12 flex-row items-center justify-end gap-1"
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${show(value)}`}
        accessibilityHint="Opens a list of choices"
        accessibilityState={{ expanded: open }}
      >
        <Host matchContents ignoreSafeArea="keyboard" colorScheme={scheme} seedColor={colors.primary}>
          {box}
        </Host>
        <ChevronDown size={16} color={colors.secondaryText} />
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={() => setOpen((o) => !o)}
      className="min-h-12 w-full flex-row items-center justify-end gap-2 rounded-lg border border-border bg-surface-1 px-3"
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${show(value)}`}
      accessibilityHint="Opens a list of choices"
      accessibilityState={{ expanded: open }}
    >
      {/* Height from the Compose content, width from this row: `{ vertical: true }`
          takes just the height from Compose so the Pressable's 48dp floor drives
          the height, and the fillMaxWidth anchor Row stretches the control to the
          box's full width minus the trailing chevron. */}
      <Host
        matchContents={{ vertical: true }}
        style={{ flex: 1 }}
        ignoreSafeArea="keyboard"
        colorScheme={scheme}
        seedColor={colors.primary}
      >
        {box}
      </Host>
      <ChevronDown size={16} color={colors.secondaryText} />
    </Pressable>
  );
}
