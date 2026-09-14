import { Pressable, Text, View } from "react-native";
import {
  Ellipsis,
  Eye,
  MessageCircle,
  Mic,
  type LucideIcon,
} from "lucide-react-native";

import { colors } from "../themes/tokens.ts";

export type ChatTab = "chat" | "voice" | "vision" | "more";

const TABS: { id: ChatTab; label: string; Icon: LucideIcon }[] = [
  { id: "chat", label: "Chat", Icon: MessageCircle },
  { id: "voice", label: "Voice", Icon: Mic },
  { id: "vision", label: "Vision", Icon: Eye },
  { id: "more", label: "More", Icon: Ellipsis },
];

/** Design's bottom tab bar (Tools removed per spec). */
export function BottomNav({
  active,
  onSelect,
}: {
  active: ChatTab;
  onSelect: (tab: ChatTab) => void;
}) {
  return (
    <View className="flex-row border-t border-border bg-base px-2 pb-1 pt-2">
      {TABS.map((t) => {
        const selected = t.id === active;
        return (
          <Pressable
            key={t.id}
            onPress={() => onSelect(t.id)}
            className="flex-1 items-center py-1"
          >
            <t.Icon
              size={22}
              color={selected ? colors.primary : colors.secondaryText}
            />
            <Text
              className={`font-sans text-caption ${selected ? "text-primary" : "text-secondary-text"}`}
            >
              {t.label}
            </Text>
            {selected && <View className="mt-1 h-0.5 w-8 rounded-full bg-primary" />}
          </Pressable>
        );
      })}
    </View>
  );
}
