/** Drawer session section: new-conversation row + the local session list.
 *
 * Moved out of AppDrawer (Wave 1 chat): the drawer owns the panel chrome
 * and footer nav, this owns the history list. Switching shows an inline
 * error instead of navigating anywhere surprising.
 */

import { useEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, SectionList, Text, TextInput, View } from "react-native";
import { useDrawerStatus } from "expo-router/drawer";
import {
  CheckCircle2,
  Circle,
  History,
  Pencil,
  Pin,
  PinOff,
  Share,
  Trash,
  X,
} from "lucide-react-native";

import { colors, scrim } from "../../themes/tokens.ts";
import { formatTime } from "../../lib/format.ts";
import { groupSessions, type SessionSection } from "../../lib/chat/session-groups.ts";
import type { ChatSession } from "../../types/chat.ts";

export function SessionList({
  sessions,
  sessionId,
  onOpen,
  onDelete,
  onRename,
  onTogglePin,
  onDeleteMany,
  onExportSelected,
}: {
  sessions: ChatSession[];
  sessionId: string | null;
  onOpen: (id: string) => Promise<boolean>;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => Promise<boolean>;
  onTogglePin: (id: string, pinned: boolean) => Promise<boolean>;
  /** Bulk delete — store action; the mid-turn guard lives per row.
   *  Resolves to the number actually deleted. */
  onDeleteMany: (ids: string[]) => Promise<number>;
  /** Bulk export of exactly these sessions. Resolves to an error
   *  message for the inline notice, or null on success/cancel. */
  onExportSelected: (ids: string[]) => Promise<string | null>;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<ChatSession | null>(null);
  const [draft, setDraft] = useState("");
  // C12 selection mode: local UI state — it must never persist.
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const drawerStatus = useDrawerStatus();

  // Derived on read (C11): no schema change, no store field — a new
  // grouping costs nothing to change later.
  const sections = useMemo(() => groupSessions(sessions), [sessions]);
  const allSelected =
    sessions.length > 0 && sessions.every((s) => selected.has(s.id));

  // Fresh panel on every open: a failed switch or export message must
  // not linger, and a closed drawer drops any selection.
  useEffect(() => {
    if (drawerStatus === "open") setNotice(null);
    if (drawerStatus === "closed") exitSelection();
  }, [drawerStatus]);

  // Selection never outlives the context that made it: a session
  // switch — drawer, chat tab, or a delete changing the pointer —
  // wipes it.
  useEffect(() => {
    exitSelection();
  }, [sessionId]);

  function exitSelection(): void {
    setSelecting(false);
    setSelected(new Set());
  }

  function toggleSelected(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(): void {
    setSelected(allSelected ? new Set() : new Set(sessions.map((s) => s.id)));
  }

  function confirmBulkDelete(): void {
    const count = selected.size;
    if (count === 0) return;
    // The count IS the question — never a bare generic confirmation.
    Alert.alert(
      `Delete ${count} conversations?`,
      "This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            const ids = [...selected];
            exitSelection();
            void runBulkDelete(ids);
          },
        },
      ],
    );
  }

  async function runBulkDelete(ids: string[]): Promise<void> {
    const deleted = await onDeleteMany(ids);
    if (deleted < ids.length) {
      // The mid-turn row kept itself: say so, or the confirmed count
      // silently disagrees with what happened.
      setNotice(
        `Kept ${ids.length - deleted} — a conversation was still in progress.`,
      );
    }
  }

  async function exportSelected(): Promise<void> {
    if (selected.size === 0) return;
    const error = await onExportSelected([...selected]);
    if (error !== null) setNotice(error);
  }

  async function saveRename(): Promise<void> {
    if (renaming === null || draft.trim() === "") return;
    const ok = await onRename(renaming.id, draft.trim());
    if (ok) setRenaming(null);
  }

  async function openSession(s: ChatSession): Promise<void> {
    // Tapping the already-open conversation does nothing further.
    if (s.id === sessionId) return;
    setNotice(null);
    const ok = await onOpen(s.id);
    if (!ok) setNotice("Couldn't load that conversation.");
  }

  return (
    <>
      <View className="flex-row items-center px-5 pb-1 pt-3">
        {selecting ? (
          <>
            <Text className="font-sans text-body-sm text-secondary-text">
              {selected.size} selected
            </Text>
            <View className="ml-auto flex-row items-center gap-1">
              <Pressable
                onPress={toggleAll}
                className="h-9 items-center justify-center px-2"
                accessibilityRole="button"
                accessibilityLabel={
                  allSelected ? "Clear selection" : "Select all conversations"
                }
              >
                <Text className="font-sans-semibold text-body-sm text-primary">
                  {allSelected ? "Clear" : "Select all"}
                </Text>
              </Pressable>
              <Pressable
                onPress={confirmBulkDelete}
                disabled={selected.size === 0}
                className={`h-9 w-9 items-center justify-center ${
                  selected.size === 0 ? "opacity-40" : ""
                }`}
                accessibilityRole="button"
                accessibilityLabel="Delete selected conversations"
              >
                <Trash size={18} color={colors.error} />
              </Pressable>
              <Pressable
                onPress={() => void exportSelected()}
                disabled={selected.size === 0}
                className={`h-9 w-9 items-center justify-center ${
                  selected.size === 0 ? "opacity-40" : ""
                }`}
                accessibilityRole="button"
                accessibilityLabel="Export selected conversations"
              >
                <Share size={16} color={colors.secondaryText} />
              </Pressable>
              <Pressable
                onPress={exitSelection}
                className="h-9 items-center justify-center px-2"
                accessibilityRole="button"
                accessibilityLabel="Done"
              >
                <Text className="font-sans-semibold text-body-sm text-primary">
                  Done
                </Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <History size={20} color={colors.secondaryText} />
            <Text className="ml-3 font-sans text-body-sm text-secondary-text">
              History
            </Text>
            <Pressable
              onPress={() => setSelecting(true)}
              className="ml-auto h-9 items-center justify-center px-2"
              accessibilityRole="button"
              accessibilityLabel="Select conversations"
            >
              <Text className="font-sans-semibold text-body-sm text-primary">
                Select
              </Text>
            </Pressable>
          </>
        )}
      </View>
      {notice !== null && (
        <Text className="px-5 py-1 font-sans text-body-sm text-secondary-text">
          {notice}
        </Text>
      )}
      <SectionList<ChatSession, SessionSection>
        sections={sections}
        keyExtractor={(s) => s.id}
        extraData={[sessionId, selected]}
        // The drawer panel has no outer scroll container (AppDrawer is
        // plain flex Views), so this list owns long-history
        // reachability — rows past the fold must stay openable, and
        // sticky headers are the issue's grouping shape. The header is
        // opaque so pin/rename/delete buttons never show through while
        // a row slides underneath.
        stickySectionHeadersEnabled
        renderSectionHeader={({ section }) => (
          <Text
            className="bg-surface-1 px-5 pb-1 pt-3 font-sans-semibold text-body-sm text-secondary-text"
            accessibilityRole="header"
          >
            {section.title}
          </Text>
        )}
        ListEmptyComponent={
          <Text className="px-5 py-2 font-sans text-body-sm text-secondary-text">
            No conversations yet.
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => {
              if (selecting) toggleSelected(item.id);
              else void openSession(item);
            }}
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
            {selecting ? (
              <Pressable
                onPress={() => toggleSelected(item.id)}
                className="h-12 w-12 items-center justify-center"
                accessibilityRole="checkbox"
                accessibilityLabel={`Select ${
                  item.title === "" ? "New conversation" : item.title
                }`}
                accessibilityState={{ checked: selected.has(item.id) }}
              >
                {selected.has(item.id) ? (
                  <CheckCircle2 size={20} color={colors.primary} />
                ) : (
                  <Circle size={20} color={colors.secondaryText} />
                )}
              </Pressable>
            ) : (
              <>
                <Pressable
                  onPress={() => void onTogglePin(item.id, !item.pinned)}
                  className="h-12 w-12 items-center justify-center"
                  accessibilityRole="button"
                  accessibilityLabel={
                    item.pinned ? "Unpin conversation" : "Pin conversation"
                  }
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
              </>
            )}
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
