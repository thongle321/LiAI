/** Bottom tab bar (DESIGN.md Navigation).
 *
 * ~69px (see TAB_BAR_HEIGHT) plus the device's bottom safe-area inset, on
 * Clean White with a 1px Hairline top border. Items are icon over label;
 * inactive is Slate, active is Signal Blue on icon and label —
 * colour is the ONLY active signal. The Surface Tint pill and the 2px
 * indicator bar are gone: the square behind the icon read as a shape
 * rather than a state. The 40x40 icon box stays because it is the touch
 * target, not decoration. Nav chrome is static: no motion, ever.
 */

import { PixelRatio, Pressable, Text, View } from "react-native";
import {
  Eye,
  MessageCircle,
  Mic,
  type LucideIcon,
} from "lucide-react-native";
import { useColors } from "@/themes/tokens.ts";

export type ChatTab = "chat" | "voice" | "vision";

/** Rendered height of the bar ITSELF at DEFAULT font scale, excluding the
 * bottom safe-area inset that (tabs)/_layout.tsx adds below it. The class
 * sum, one term per line:
 *   border-t            1
 *   pt-2                8
 *   icon box h-10      40
 *   label box          16  (global caption 12/16 — the pocketpal 11/14
 *                           pin is gone: the label now scales with the
 *                           OS font setting, see the Text below)
 *   pb-1                4
 * Single definition by decree: the chat screen's keyboard compensation and
 * the message list's offset both flow from it through store/keyboard.ts,
 * because when this change landed three separate copies (60 in code, 64
 * in prose, 75 actual) is exactly how the no-model card came to drift
 * when the keyboard opened. This value is the SEED only — the bar's own
 * onLayout (app/(drawer)/(tabs)/_layout.tsx) replaces it with the real
 * height, so a bigger label at a large OS font scale is measured, never
 * mis-compensated. Change this and utils/keyboard.ts's TAB_BAR_HEIGHT_SEED
 * together (tests/keyboard-avoidance.test.ts locks the pair). */
export const TAB_BAR_HEIGHT = 69;

const TABS: { id: ChatTab; label: string; Icon: LucideIcon }[] = [
  { id: "chat", label: "Chat", Icon: MessageCircle },
  { id: "voice", label: "Voice", Icon: Mic },
  { id: "vision", label: "Vision", Icon: Eye },
];

/** Global caption line-height (global.css --text-caption--line-height),
 * restated here ONLY because the OS font scale does not scale RN's
 * absolute lineHeight — see the Text below. */
const CAPTION_LINE_HEIGHT = 16;

export function BottomNav({
  active,
  onSelect,
}: {
  active: ChatTab;
  onSelect: (tab: ChatTab) => void;
}) {
  const colors = useColors();
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
              numberOfLines={1}
              // Scales with the OS font setting to 1.5x (Part 2 audit,
              // P2): the old 1.1 cap kept large-text users from reading
              // their own navigation. The bar GROWS instead of pinning —
              // its real height flows to the keyboard compensation via
              // the onLayout measurement in (tabs)/_layout.tsx, so a
              // taller bar cannot drift the chat column.
              maxFontSizeMultiplier={1.5}
              // RN's absolute lineHeight does NOT scale with the OS font
              // setting, so the class's 16px box would clip the 1.5x
              // glyphs — the label's own line box tracks the scale.
              // (Inline: a runtime-computed value, per AGENTS.md.)
              style={{
                lineHeight: Math.round(
                  CAPTION_LINE_HEIGHT * PixelRatio.getFontScale(),
                ),
              }}
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
