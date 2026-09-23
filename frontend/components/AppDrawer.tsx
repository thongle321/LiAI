/** PocketPal-style drawer content, LiAI tokens only.
 *
 * Rendered by the navigator-owned <Drawer> (app/(drawer)/_layout.tsx),
 * which provides the panel slide, scrim, gestures, and back handling —
 * this file is only the panel UI. History rows come from the store's
 * on-device index (tap loads, X deletes).
 */

import { useEffect, useState } from "react";
import {
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useDrawerStatus } from "expo-router/drawer";
import Constants from "expo-constants";
import {
  CircleHelp,
  History,
  MessageSquarePlus,
  Settings,
  X,
  Download,
  type LucideIcon,
} from "lucide-react-native";

import { colors } from "../themes/tokens.ts";
import { APP_NAME } from "../constants/app.ts";
import { formatTime } from "../lib/format.ts";
import { CONNECTION_DOT_CLASS } from "../lib/connection.ts";
import {
  useChatStore,
  type ChatSession,
} from "../store/chat.ts";

const VERSION = Constants.expoConfig?.version ?? "0.1.0";

export function AppDrawerContent({ onClose }: { onClose: () => void }) {
  const connection = useChatStore((s) => s.connection);
  const sessionId = useChatStore((s) => s.sessionId);
  const sessions = useChatStore((s) => s.sessions);
  const newConversation = useChatStore((s) => s.newConversation);
  const switchSession = useChatStore((s) => s.switchSession);
  const deleteSession = useChatStore((s) => s.deleteSession);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const drawerStatus = useDrawerStatus();

  // Fresh panel on every open: a failed switch error must not linger.
  useEffect(() => {
    if (drawerStatus === "open") setSwitchError(null);
  }, [drawerStatus]);

  function go(path: "/settings" | "/about" | "/models"): void {
    onClose();
    router.push(path);
  }

  function openSession(s: ChatSession): void {
    // Tapping the already-open conversation just closes the drawer.
    if (s.id === sessionId) {
      onClose();
      return;
    }
    setSwitchError(null);
    void switchSession(s.id).then((ok) => {
      if (ok) onClose();
      else setSwitchError("Couldn't load that conversation.");
    });
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface1 }}>
      <View className="flex-1">
              <View className="flex-row items-center border-b border-border px-4 py-3">
                <View className={CONNECTION_DOT_CLASS[connection]} />
                <Text className="ml-2 flex-1 font-sans-semibold text-h3 text-primary">
                  {APP_NAME}
                </Text>
                <Pressable onPress={onClose} className="px-1 py-1">
                  <X size={20} color={colors.secondaryText} />
                </Pressable>
              </View>

              <FlatList
                data={sessions}
                keyExtractor={(s) => s.id}
                extraData={sessionId}
                className="flex-1"
                ListHeaderComponent={
                  <>
                    <DrawerItem
                      Icon={MessageSquarePlus}
                      label="New conversation"
                      onPress={() => {
                        void newConversation();
                        onClose();
                      }}
                    />
                    <View className="flex-row items-center px-4 pb-1 pt-3">
                      <History size={16} color={colors.secondaryText} />
                      <Text className="ml-2 font-sans text-body-sm text-secondary-text">
                        History
                      </Text>
                    </View>
                    {switchError !== null && (
                      <Text className="px-4 py-1 font-sans text-body-sm text-secondary-text">
                        {switchError}
                      </Text>
                    )}
                  </>
                }
                ListEmptyComponent={
                  <Text className="px-4 py-2 font-sans text-body-sm text-secondary-text">
                    No conversations yet.
                  </Text>
                }
                renderItem={({ item }) => (
                  <HistoryRow
                    session={item}
                    selected={item.id === sessionId}
                    onOpen={() => openSession(item)}
                    onDelete={() => void deleteSession(item.id)}
                  />
                )}
                ListFooterComponent={
                  <>
                    <View className="my-2 border-t border-border" />
                    <DrawerItem Icon={Download} label="Models" onPress={() => go("/models")} />
                    <DrawerItem Icon={Settings} label="Settings" onPress={() => go("/settings")} />
                    <DrawerItem Icon={CircleHelp} label="About" onPress={() => go("/about")} />
                  </>
                }
              />

              <Text className="border-t border-border px-4 py-3 font-sans text-body-sm text-secondary-text">
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
    <Pressable onPress={onPress} className="flex-row items-center px-4 py-3">
      <Icon size={20} color={colors.primary} />
      <Text className="ml-3 font-sans text-body-md text-primary-text">{label}</Text>
    </Pressable>
  );
}

function HistoryRow({
  session,
  selected,
  onOpen,
  onDelete,
}: {
  session: ChatSession;
  selected: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <Pressable
      onPress={onOpen}
      onLongPress={onDelete}
      className={`flex-row items-center px-4 py-2 ${selected ? "bg-surface-2" : ""}`}
    >
      <View className="flex-1">
        <Text
          numberOfLines={1}
          className={`font-sans text-body-md ${selected ? "text-primary" : "text-primary-text"}`}
        >
          {session.title}
        </Text>
        <Text className="font-sans text-body-sm text-secondary-text">
          {formatTime(session.at)}
        </Text>
      </View>
      <Pressable onPress={onDelete} className="px-2 py-1">
        <X size={16} color={colors.secondaryText} />
      </Pressable>
    </Pressable>
  );
}
