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
import { defaultMinSize, menuAnchor } from "@expo/ui/jetpack-compose/modifiers";
import { ChevronDown } from "lucide-react-native";

import { useColors, useColorScheme, typeScale } from "../themes/tokens.ts";
import type { PickerMenuProps } from "./picker-menu";

export function PickerMenu<T extends string>({
  label,
  options,
  value,
  onChange,
  show,
}: PickerMenuProps<T>) {
  const colors = useColors();
  const scheme = useColorScheme();
  const [open, setOpen] = useState(false);
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
        <ExposedDropdownMenuBox expanded={open} onExpandedChange={setOpen}>
          {/* The anchor the popup positions against, and the only thing
              Compose draws in the row. */}
          <Row
            verticalAlignment="center"
            horizontalArrangement="end"
            modifiers={[menuAnchor()]}
          >
            {/* maxLines={1} + ellipsis: device voice names run long
                ("Microsoft Zira Desktop - English (United States)"). Without
                a cap the anchor wraps and the whole row grows, which is the
                same class of defect as the 56dp text field this replaced.
                The MENU items below stay unwrapped — that is where the user
                actually reads a long name. */}
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
            // A Material 3 ExposedDropdownMenu sizes itself to its
            // anchor, and this anchor is a short value ("Tavily"). That
            // left the popup a few characters wide and wrapped every
            // option into a one-word-per-line column. The floor is set on
            // the menu rather than the anchor so the row keeps its own
            // compact width; long names still grow it, because this is a
            // minimum, not a fixed size.
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
      </Host>
      <ChevronDown size={16} color={colors.secondaryText} />
    </Pressable>
  );
}
