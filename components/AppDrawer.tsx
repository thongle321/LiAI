/** PocketPal-style drawer content, LiAI tokens only.
 *
 * Rendered by the navigator-owned <Drawer> (app/(drawer)/_layout.tsx),
 * which provides the panel slide, scrim, gestures, and back handling —
 * this file is only the panel chrome and footer nav. The history section
 * lives in components/chat/SessionList (the local session list).
 */

import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import Constants from "expo-constants";
import {
  CircleHelp,
  Settings,
  X,
  Download,
  Mic,
  type LucideIcon,
} from "lucide-react-native";

import { colors } from "../themes/tokens.ts";
import { APP_NAME } from "../constants/app.ts";
import { useChatStore } from "../store/chat.ts";
import { SessionList } from "./chat/SessionList.tsx";

const VERSION = Constants.expoConfig?.version ?? "0.1.0";

export function AppDrawerContent({ onClose }: { onClose: () => void }) {
  const sessionId = useChatStore((s) => s.sessionId);
  const sessions = useChatStore((s) => s.sessions);
  const newConversation = useChatStore((s) => s.newConversation);
  const switchSession = useChatStore((s) => s.switchSession);
  const deleteSession = useChatStore((s) => s.deleteSession);
  const renameSession = useChatStore((s) => s.renameSession);
  const setPinned = useChatStore((s) => s.setPinned);

  function go(path: "/settings" | "/about" | "/models" | "/voice-settings"): void {
    // ONE navigation, no closeDrawer(): every destination is a screen of
    // the drawer navigator, and its router closes the panel as part of the
    // same state transition as the swap (DrawerRouter getStateForAction /
    // NAVIGATE -> closeDrawer when the index changed). Closing AND pushing
    // in the same tick ran two animations in one frame — the jank.
    router.navigate(path);
  }

  async function openSession(id: string): Promise<boolean> {
    // Tapping the already-open conversation just closes the drawer.
    if (id === sessionId) {
      onClose();
      return true;
    }
    const ok = await switchSession(id);
    if (ok) onClose();
    return ok;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface1 }}>
      <View className="flex-1">
        <View className="h-16 flex-row items-center border-b border-border px-5">
          <Text className="flex-1 font-sans-semibold text-h2 text-primary-text">
            {APP_NAME}
          </Text>
          <Pressable
            onPress={onClose}
            className="h-12 w-12 items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel="Close menu"
            hitSlop={4}
          >
            <X size={20} color={colors.secondaryText} />
          </Pressable>
        </View>

        <View className="flex-1">
          <SessionList
            sessions={sessions}
            sessionId={sessionId}
            onNew={() => {
              void newConversation();
              onClose();
            }}
            onOpen={(id) => openSession(id)}
            onDelete={(id) => void deleteSession(id)}
            onRename={(id, title) => renameSession(id, title)}
            onTogglePin={(id, pinned) => setPinned(id, pinned)}
          />
        </View>

        <View className="border-t border-border">
          <DrawerItem Icon={Download} label="Models" onPress={() => go("/models")} />
          <DrawerItem Icon={Mic} label="Voice" onPress={() => go("/voice-settings")} />
          <DrawerItem Icon={Settings} label="Settings" onPress={() => go("/settings")} />
          <DrawerItem Icon={CircleHelp} label="About" onPress={() => go("/about")} />
        </View>

        <Text className="border-t border-border px-5 py-3 font-sans text-caption text-secondary-text">
          v{VERSION}
        </Text>
      </View>
    </SafeAreaView>
  );
}

function DrawerItem({
  Icon,
  label,
  onPress,
}: {
  Icon: LucideIcon;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="min-h-12 flex-row items-center px-5 py-3"
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Icon size={20} color={colors.secondaryText} />
      <Text className="ml-3 flex-1 font-sans text-body-md text-primary-text">{label}</Text>
    </Pressable>
  );
}
