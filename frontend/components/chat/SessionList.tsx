/** Drawer session section: new-conversation row + backend session list.
 *
 * Moved out of AppDrawer (Wave 1 chat): the drawer owns the panel chrome
 * and footer nav, this owns the history list. Switching shows an inline
 * error instead of navigating anywhere surprising.
 */

import { useEffect, useState } from "react";
import { FlatList, Modal, Pressable, Text, TextInput, View } from "react-native";
import { useDrawerStatus } from "expo-router/drawer";
import { History, MessageSquarePlus, Pencil, Pin, PinOff, X } from "lucide-react-native";

import { colors } from "../../themes/tokens.ts";
import { formatTime } from "../../lib/format.ts";
import type { ChatSession } from "../../types/chat.ts";

export function SessionList({
  sessions,
  sessionId,
  onNew,
  onOpen,
  onDelete,
  onRename,
  onTogglePin,
}: {
  sessions: ChatSession[];
  sessionId: string | null;
  onNew: () => void;
  onOpen: (id: string) => Promise<boolean>;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => Promise<boolean>;
  onTogglePin: (id: string, pinned: boolean) => Promise<boolean>;
}) {
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<ChatSession | null>(null);
  const [draft, setDraft] = useState("");
  const drawerStatus = useDrawerStatus();

  // Fresh panel on every open: a failed switch error must not linger.
  useEffect(() => {
    if (drawerStatus === "open") setSwitchError(null);
  }, [drawerStatus]);

  async function saveRename(): Promise<void> {
    if (renaming === null || draft.trim() === "") return;
    const ok = await onRename(renaming.id, draft.trim());
    if (ok) setRenaming(null);
  }

  async function openSession(s: ChatSession): Promise<void> {
    // Tapping the already-open conversation does nothing further.
    if (s.id === sessionId) return;
    setSwitchError(null);
    const ok = await onOpen(s.id);
    if (!ok) setSwitchError("Couldn't load that conversation.");
  }

  return (
    <>
      <Pressable onPress={onNew} className="flex-row items-center px-4 py-3">
        <MessageSquarePlus size={20} color={colors.primary} />
        <Text className="ml-3 font-sans text-body-md text-primary-text">
          New conversation
        </Text>
      </Pressable>
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
      <FlatList
        data={sessions}
        keyExtractor={(s) => s.id}
        extraData={sessionId}
        scrollEnabled={false}
        ListEmptyComponent={
          <Text className="px-4 py-2 font-sans text-body-sm text-secondary-text">
            No conversations yet.
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => void openSession(item)}
            className={`flex-row items-center px-4 py-2 ${
              item.id === sessionId ? "bg-surface-2" : ""
            }`}
          >
            <View className="flex-1">
              <Text
                numberOfLines={1}
                className={`font-sans text-body-md ${
                  item.id === sessionId ? "text-primary" : "text-primary-text"
                }`}
              >
                {item.title === "" ? "New conversation" : item.title}
              </Text>
              <Text className="font-sans text-body-sm text-secondary-text">
                {formatTime(item.at)}
              </Text>
            </View>
            <Pressable
              onPress={() => void onTogglePin(item.id, !item.pinned)}
              className="px-2 py-1"
            >
              {item.pinned ? (
                <PinOff size={16} color={colors.primary} />
              ) : (
                <Pin size={16} color={colors.secondaryText} />
              )}
            </Pressable>
            <Pressable
              onPress={() => {
                setRenaming(item);
                setDraft(item.title);
              }}
              className="px-2 py-1"
            >
              <Pencil size={16} color={colors.secondaryText} />
            </Pressable>
            <Pressable onPress={() => onDelete(item.id)} className="px-2 py-1">
              <X size={16} color={colors.secondaryText} />
            </Pressable>
          </Pressable>
        )}
      />
      <Modal
        visible={renaming !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setRenaming(null)}
      >
        <View className="flex-1 bg-black/60 items-center justify-center p-4">
          <View className="bg-surface-1 border border-border rounded-2xl w-full p-6">
            <Text className="font-sans-semibold text-h4 text-primary-text mb-4">
              Rename conversation
            </Text>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Conversation title"
              autoFocus
              className="font-sans text-body-md text-primary-text bg-surface-2 border border-border rounded-lg px-4 py-3"
              placeholderTextColor={colors.secondaryText}
            />
            <View className="flex-row gap-2 pt-4">
              <Pressable
                onPress={() => setRenaming(null)}
                className="flex-1 py-3 px-4 bg-surface-2 border border-border rounded-lg items-center"
              >
                <Text className="font-sans text-body-md text-secondary-text">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void saveRename()}
                disabled={draft.trim() === ""}
                className="flex-1 py-3 px-4 bg-primary border border-primary/50 rounded-lg items-center"
              >
                <Text className="font-sans-semibold text-body-md text-base">Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
