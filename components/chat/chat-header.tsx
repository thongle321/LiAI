/** Chat header in LiAI style, derived from PocketPal's ChatHeader.
 *
 * Two-line title: conversation name, then the active model. Left slot opens
 * the drawer; right slot has New conversation + ChatMenu. Fixed 56dp height,
 * matching DESIGN.md's header pin.
 */

import { Pressable, Text, View } from "react-native";
import { Menu, SquarePen, Users } from "lucide-react-native";
import Animated from "react-native-reanimated";

import { useColors } from "@/themes/tokens.ts";
import { APP_NAME } from "@/constants/app.ts";
import { usePressFeedback } from "@/utils/motion.ts";
import { ChatMenu } from "./chat-menu.tsx";

export function ChatHeader({
  title,
  modelLabel,
  onOpenModels,
  onOpenDrawer,
  onNewConversation,
  onOpenGeneration,
  onOpenSearch,
  onOpenCompanions,
}: {
  title: string | null;
  modelLabel: string | null;
  onOpenModels: () => void;
  onOpenDrawer: () => void;
  onNewConversation: () => void;
  onOpenGeneration: () => void;
  onOpenSearch: () => void;
  onOpenCompanions: () => void;
}) {
  const colors = useColors();
  const menuPress = usePressFeedback();
  const penPress = usePressFeedback();

  return (
    <View className="h-14 flex-row items-center border-b border-border bg-surface-1 px-5">
      <View className="w-36 flex-row items-center">
        <Animated.View style={menuPress.animatedStyle}>
          <Pressable
            onPress={onOpenDrawer}
            onPressIn={menuPress.onPressIn}
            onPressOut={menuPress.onPressOut}
            className="icon-btn"
            accessibilityRole="button"
            accessibilityLabel="Open menu"
            hitSlop={4}
          >
            <Menu size={20} color={colors.primaryText} />
          </Pressable>
        </Animated.View>
      </View>
      <Pressable
        onPress={onOpenModels}
        className="flex-1 items-center"
        accessibilityRole="button"
        accessibilityLabel={
          modelLabel === null ? "Open models" : `Open models — ${modelLabel}`
        }
      >
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={1.5}
          className="text-center font-sans-semibold text-title text-primary-text"
        >
          {title ?? APP_NAME}
        </Text>
        {modelLabel !== null && (
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={1.5}
            className="text-center text-quiet"
          >
            {modelLabel}
          </Text>
        )}
      </Pressable>
      <View className="w-36 flex-row items-center justify-end">
        <Animated.View style={penPress.animatedStyle}>
          <Pressable
            onPress={onNewConversation}
            onPressIn={penPress.onPressIn}
            onPressOut={penPress.onPressOut}
            className="icon-btn"
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel="New conversation"
          >
            <SquarePen size={20} color={colors.primaryText} />
          </Pressable>
        </Animated.View>
        <Pressable
          onPress={onOpenCompanions}
          className="icon-btn"
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel="Companions"
        >
          <Users size={20} color={colors.primaryText} />
        </Pressable>
        <ChatMenu
          onOpenGeneration={onOpenGeneration}
          onOpenSearch={onOpenSearch}
        />
      </View>
    </View>
  );
}
