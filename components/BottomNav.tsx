/** Bottom tab bar (DESIGN.md Navigation).
 *
 * 69px (see TAB_BAR_HEIGHT) plus the device's bottom safe-area inset, on
 * Clean White with a 1px Hairline top border. Items are icon over Caption
 * label; inactive is Slate, active is Signal Blue on icon and label —
 * colour is the ONLY active signal. The Surface Tint pill and the 2px
 * indicator bar are gone: the square behind the icon read as a shape
 * rather than a state. The 40x40 icon box stays because it is the touch
 * target, not decoration. Nav chrome is static: no motion, ever.
 */

import { Pressable, Text, View } from "react-native";
import {
  Eye,
  MessageCircle,
  Mic,
  type LucideIcon,
} from "lucide-react-native";

import { colors } from "../themes/tokens.ts";

export type ChatTab = "chat" | "voice" | "vision";

/** Rendered height of the bar ITSELF, excluding the safe-area inset that
 * (tabs)/_layout.tsx adds below it. The class sum, one term per line:
 *   border-t            1
 *   pt-2                8
 *   icon box h-10      40
 *   caption label      16  (text-caption line-height, global.css)
 *   pb-1                4
 * Single definition by decree: the chat screen's keyboard compensation and
 * the message list's offset both import it, because when this change landed
 * three separate copies (60 in code, 64 in prose, 75 actual) is exactly how
 * the no-model card came to drift when the keyboard opened. The SUM above
 * is the spec — if the bar's classes change, change this with them; the
 * value itself is verified on device, not by test. */
export const TAB_BAR_HEIGHT = 69;

const TABS: { id: ChatTab; label: string; Icon: LucideIcon }[] = [
  { id: "chat", label: "Chat", Icon: MessageCircle },
  { id: "voice", label: "Voice", Icon: Mic },
  { id: "vision", label: "Vision", Icon: Eye },
];

export function BottomNav({
  active,
  onSelect,
}: {
  active: ChatTab;
  onSelect: (tab: ChatTab) => void;
}) {
  return (
    <View className="flex-row border-t border-border bg-surface-1 px-2 pt-2 pb-1">
      {TABS.map((t) => {
        const selected = t.id === active;
        return (
          <Pressable
            key={t.id}
            onPress={() => onSelect(t.id)}
            className="flex-1 items-center"
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={t.label}
          >
            {/* No fill: the active state is the icon and label colour only.
                The box is not the touch target — the Pressable is, and it
                measures 56px (this box + the label) so it clears the 48dp
                floor; the box gives it that height. */}
            <View className="h-10 w-10 items-center justify-center">
              <t.Icon
                size={24}
                color={selected ? colors.primary : colors.secondaryText}
              />
            </View>
            <Text
              className={`font-sans text-caption ${
                selected ? "text-primary" : "text-secondary-text"
              }`}
            >
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
