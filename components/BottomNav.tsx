/** Bottom tab bar (DESIGN.md Navigation).
 *
 * 64px plus the device's bottom safe-area inset, on Clean White with a
 * 1px Hairline top border. Items are icon over Caption label; inactive is
 * Slate, active is Signal Blue sitting on a Surface Tint pill with a 2px
 * indicator above the label. The pill and indicator are always mounted —
 * mounting on selection changes the row's height and the bar jumps under
 * the user's thumb. Nav chrome is static: no motion, ever.
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
            <View
              className={`h-10 w-10 items-center justify-center rounded-xl ${
                selected ? "bg-surface-3" : "bg-transparent"
              }`}
            >
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
            {/* Always mounted, transparent when idle — see the file note. */}
            <View
              className={`mt-1 h-0.5 w-8 rounded-full ${
                selected ? "bg-primary" : "bg-transparent"
              }`}
            />
          </Pressable>
        );
      })}
    </View>
  );
}
