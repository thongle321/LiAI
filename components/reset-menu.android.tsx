/** Android reset menu: the Compose dropdown (PickerMenu.android pattern). */

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

import { colors, typeScale } from "../themes/tokens.ts";
import type { ResetMenuProps } from "./reset-menu";

export function ResetMenu({ items }: ResetMenuProps) {
  const [open, setOpen] = useState(false);
  return (
    <Pressable
      onPress={() => setOpen((o) => !o)}
      className="min-h-12 flex-row items-center gap-1"
      accessibilityRole="button"
      accessibilityLabel="Reset"
      accessibilityHint="Opens a list of reset destinations"
      accessibilityState={{ expanded: open }}
    >
      <Host matchContents ignoreSafeArea="keyboard" colorScheme="light" seedColor={colors.primary}>
        <ExposedDropdownMenuBox expanded={open} onExpandedChange={setOpen}>
          <Row
            verticalAlignment="center"
            horizontalArrangement="start"
            modifiers={[menuAnchor()]}
          >
            <ComposeText color={colors.primary} style={{ fontSize: typeScale.bodyMd.size }}>
              Reset
            </ComposeText>
          </Row>
          <ExposedDropdownMenu
            expanded={open}
            onDismissRequest={() => setOpen(false)}
            // Same floor lesson as PickerMenu: a menu sized to a short
            // anchor wraps every option into a one-word column.
            modifiers={[defaultMinSize({ minWidth: 200 })]}
          >
            {items.map((item) => (
              <DropdownMenuItem
                key={item.label}
                onClick={() => {
                  setOpen(false);
                  item.onPress();
                }}
              >
                <DropdownMenuItem.Text>
                  <ComposeText color={colors.primaryText} style={{ fontSize: typeScale.bodyMd.size }}>
                    {item.label}
                  </ComposeText>
                </DropdownMenuItem.Text>
              </DropdownMenuItem>
            ))}
          </ExposedDropdownMenu>
        </ExposedDropdownMenuBox>
      </Host>
      <ChevronDown size={16} color={colors.primary} />
    </Pressable>
  );
}
