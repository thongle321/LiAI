import { Pressable, Text, View } from "react-native";

export type ChatTab = "chat" | "voice" | "vision" | "more";

const TABS: { id: ChatTab; label: string; glyph: string }[] = [
  { id: "chat", label: "Chat", glyph: "💬" },
  { id: "voice", label: "Voice", glyph: "🎙" },
  { id: "vision", label: "Vision", glyph: "👁" },
  { id: "more", label: "More", glyph: "⋯" },
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
            <Text
              className={`text-body-lg ${selected ? "text-primary" : "text-secondary-text"}`}
            >
              {t.glyph}
            </Text>
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
