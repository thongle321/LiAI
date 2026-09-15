/** PocketPal-style overlay drawer, LiAI tokens only.
 *
 * Slide-in panel + scrim; chat stays mounted underneath. Dismisses via
 * scrim tap, item tap, or hardware back. History rows come from the
 * store's on-device index (tap loads, X deletes).
 */

import { useEffect, useRef } from "react";
import { BackHandler, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import Constants from "expo-constants";
import {
  CircleHelp,
  History,
  MessageSquarePlus,
  Settings,
  X,
  type LucideIcon,
} from "lucide-react-native";

import { colors } from "../themes/tokens.ts";
import { APP_NAME } from "../constants/app.ts";
import { formatTime } from "./Bubble.tsx";
import {
  useChatStore,
  type ChatSession,
  type Connection,
} from "../store/chat.ts";

const CONNECTION_DOT_CLASS: Record<Connection, string> = {
  unknown: "status-dot status-dot--offline",
  up: "status-dot status-dot--online",
  down: "status-dot status-dot--error",
};

const VERSION = Constants.expoConfig?.version ?? "0.1.0";

export function AppDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const connection = useChatStore((s) => s.connection);
  const sessionId = useChatStore((s) => s.sessionId);
  const sessions = useChatStore((s) => s.sessions);
  const newConversation = useChatStore((s) => s.newConversation);
  const switchSession = useChatStore((s) => s.switchSession);
  const deleteSession = useChatStore((s) => s.deleteSession);
  // ponytail: touch deltas, not a gesture lib — swipe left closes.
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [open, onClose]);

  function go(path: "/settings" | "/about"): void {
    onClose();
    router.push(path);
  }

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 flex-row bg-black/60">
        <SafeAreaView
          style={{ width: 280, backgroundColor: "#141515" }}
          onTouchStart={(e) => {
            touchX.current = e.nativeEvent.pageX;
          }}
          onTouchEnd={(e) => {
            if (touchX.current !== null && touchX.current - e.nativeEvent.pageX > 60) {
              onClose();
            }
            touchX.current = null;
          }}
        >
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

            <ScrollView className="flex-1">
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
              {sessions.length === 0 ? (
                <Text className="px-4 py-2 font-sans text-body-sm text-secondary-text">
                  No conversations yet.
                </Text>
              ) : (
                sessions.map((s) => (
                  <HistoryRow
                    key={s.id}
                    session={s}
                    current={s.id === sessionId}
                    onOpen={() => {
                      void switchSession(s.id).then((ok) => {
                        if (ok) onClose();
                      });
                    }}
                    onDelete={() => void deleteSession(s.id)}
                  />
                ))
              )}
              <View className="my-2 border-t border-border" />
              <DrawerItem Icon={Settings} label="Settings" onPress={() => go("/settings")} />
              <DrawerItem Icon={CircleHelp} label="About" onPress={() => go("/about")} />
            </ScrollView>

            <Text className="border-t border-border px-4 py-3 font-sans text-body-sm text-secondary-text">
              v{VERSION}
            </Text>
          </View>
        </SafeAreaView>
        <Pressable onPress={onClose} className="flex-1" />
      </View>
    </Modal>
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
  current,
  onOpen,
  onDelete,
}: {
  session: ChatSession;
  current: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <Pressable
      onPress={onOpen}
      onLongPress={onDelete}
      className={`flex-row items-center px-4 py-2 ${current ? "bg-surface-2" : ""}`}
    >
      <View className="flex-1">
        <Text
          numberOfLines={1}
          className={`font-sans text-body-md ${current ? "text-primary" : "text-primary-text"}`}
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
