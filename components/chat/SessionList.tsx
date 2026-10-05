/** Drawer session section: new-conversation row + the local session list.
 *
 * Moved out of AppDrawer (Wave 1 chat): the drawer owns the panel chrome
 * and footer nav, this owns the history list. Switching shows an inline
 * error instead of navigating anywhere surprising.
 */

import { useEffect, useState } from "react";
import { FlatList, Modal, Pressable, Text, TextInput, View } from "react-native";
import { useDrawerStatus } from "expo-router/drawer";
import { History, Pencil, Pin, PinOff, X } from "lucide-react-native";

import { colors, scrim } from "../../themes/tokens.ts";
import { formatTime } from "../../lib/format.ts";
import type { ChatSession } from "../../types/chat.ts";

export function SessionList({
  sessions,
  sessionId,
  onOpen,
  onDelete,
  onRename,
  onTogglePin,
}: {
  sessions: ChatSession[];
  sessionId: string | null;
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
      <View className="flex-row items-center px-5 pb-1 pt-3">
        <History size={20} color={colors.secondaryText} />
        <Text className="ml-3 font-sans text-body-sm text-secondary-text">
          History
        </Text>
      </View>
      {switchError !== null && (
        <Text className="px-5 py-1 font-sans text-body-sm text-secondary-text">
          {switchError}
        </Text>
      )}
      <FlatList
        data={sessions}
        keyExtractor={(s) => s.id}
        extraData={sessionId}
        scrollEnabled={false}
        ListEmptyComponent={
          <Text className="px-5 py-2 font-sans text-body-sm text-secondary-text">
            No conversations yet.
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => void openSession(item)}
            className={`menu-row ${
              item.id === sessionId ? "bg-surface-2" : ""
            }`}
            accessibilityRole="button"
            accessibilityLabel={item.title}
            accessibilityState={{ selected: item.id === sessionId }}
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
              className="h-12 w-12 items-center justify-center"
              accessibilityRole="button"
              accessibilityLabel={item.pinned ? "Unpin conversation" : "Pin conversation"}
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
              className="h-12 w-12 items-center justify-center"
              accessibilityRole="button"
              accessibilityLabel="Rename conversation"
            >
              <Pencil size={16} color={colors.secondaryText} />
            </Pressable>
            <Pressable
              onPress={() => onDelete(item.id)}
              className="h-12 w-12 items-center justify-center"
              accessibilityRole="button"
              accessibilityLabel="Delete conversation"
            >
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
        <View className="flex-1 items-center justify-center p-5" style={{ backgroundColor: scrim }}>
          <View className="w-full rounded-2xl border border-border bg-surface-1 p-5">
            <Text className="mb-4 font-sans-semibold text-body-lg text-primary-text">
              Rename conversation
            </Text>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Conversation title"
              autoFocus
              className="input font-sans text-body-md"
              placeholderTextColor={colors.secondaryText}
              accessibilityLabel="Conversation title"
            />
            <View className="flex-row gap-2 pt-4">
              <Pressable
                onPress={() => setRenaming(null)}
                className="btn btn--secondary flex-1"
                accessibilityRole="button"
                accessibilityLabel="Cancel rename"
              >
                <Text className="font-sans text-body-md text-primary">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void saveRename()}
                disabled={draft.trim() === ""}
                className="btn btn--primary flex-1"
                accessibilityRole="button"
                accessibilityLabel="Save name"
              >
                <Text className="font-sans-semibold text-body-md text-on-primary">Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
