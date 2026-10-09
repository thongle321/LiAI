/** Drawer session section: the local session list.
 *
 * Moved out of AppDrawer (Wave 1 chat): the drawer owns the panel chrome
 * and footer nav, this owns the history list. Switching shows an inline
 * error instead of navigating anywhere surprising.
 *
 * Selection mode is PocketPal's shape end to end (SidebarContent.tsx):
 * long-press a row for a menu (Pin · Rename · Export · Delete ·
 * "Select…"), and "Select…" enters selection mode with THAT row already
 * checked. In mode the header is Cancel · "N selected" · Export · Delete,
 * a full-width "Select All" row sits under it, and rows carry a LEADING
 * checkbox. The row's Pin/Rename/Delete buttons are gone — they live in
 * the menu now, so the row carries only the pin star.
 *
 * Selection deliberately OUTLIVES the drawer (PocketParity: it is store
 * state there, and the store has no close-drawer reset). Two exits only:
 * Cancel, and a successful bulk action.
 */

import { useEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, SectionList, Text, TextInput, View } from "react-native";
import {
  CheckCircle2,
  Circle,
  History,
  Pencil,
  Pin,
  PinOff,
  Share,
  Star,
  Trash,
} from "lucide-react-native";

import { colors, scrim } from "../../themes/tokens.ts";
import { formatTime } from "../../lib/format.ts";
import { groupSessions, type SessionSection } from "../../lib/chat/session-groups.ts";
import type { ChatSession } from "../../types/chat.ts";

/** The row whose menu is open, and where the finger was. */
interface MenuAnchor {
  session: ChatSession;
  x: number;
  y: number;
}

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
  /** Export these sessions, one file each (PocketParity). Resolves to an
   *  error message for the inline notice, or null on success/cancel. */
  onExportSelected: (ids: string[]) => Promise<string | null>;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<ChatSession | null>(null);
  const [draft, setDraft] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<MenuAnchor | null>(null);

  // Derived on read (C11): no schema change, no store field — a new
  // grouping costs nothing to change later.
  const sections = useMemo(() => groupSessions(sessions), [sessions]);
  const allSelected =
    sessions.length > 0 && sessions.every((s) => selected.has(s.id));

  // Only the MESSAGE is cleared per open — the selection is not. It is
  // meant to survive closing the drawer (PocketParity), so a stale
  // selection is the user's own doing, and Cancel is one tap away.
  useEffect(() => {
    setNotice(null);
  }, []);

  function exitSelection(): void {
    setSelecting(false);
    setSelected(new Set());
  }

  /** "Select…" — enter with the row already checked (PocketParity). */
  function enterSelectionMode(id: string): void {
    setSelected(new Set([id]));
    setSelecting(true);
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

  async function exportIds(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const error = await onExportSelected(ids);
    if (error !== null) setNotice(error);
    // PocketParity: a completed export leaves selection mode, whether it
    // exported one row from the menu or a whole selection.
    else exitSelection();
  }

  async function saveRename(): Promise<void> {
    if (renaming === null || draft.trim() === "") return;
    const ok = await onRename(renaming.id, draft.trim());
    if (ok) setRenaming(null);
  }

  async function openSession(s: ChatSession): Promise<void> {
// No early return for the already-open conversation: the caller
    // navigates to the chat screen, and the drawer only closes once it
    // has somewhere to be. Bailing out here used to make the tap look
    // dead from any screen other than chat, where the panel happened to
    // be covering the screen the user wanted anyway.
    setNotice(null);
    const ok = await onOpen(s.id);
    if (!ok) setNotice("Couldn't load that conversation.");
  }

  function openRowMenu(session: ChatSession, event: { nativeEvent: { pageX: number; pageY: number } }): void {
    setMenu({ session, x: event.nativeEvent.pageX, y: event.nativeEvent.pageY });
  }

  const menuSession = menu?.session;

  return (
    <>
      {selecting ? (
        <>
          <View className="flex-row items-center px-5 pb-1 pt-3">
            <Pressable
              onPress={exitSelection}
              className="h-9 justify-center pr-2"
              accessibilityRole="button"
              accessibilityLabel="Cancel selection"
            >
              <Text className="font-sans text-body-sm text-primary">
                Cancel
              </Text>
            </Pressable>
            <Text className="flex-1 text-center font-sans text-body-sm text-secondary-text">
              {selected.size} selected
            </Text>
            <View className="flex-row items-center">
              <Pressable
                onPress={() => void exportIds([...selected])}
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
            </View>
          </View>
          {/* PocketParity: select-all is a full-width row under the
              header (SelectAllRow, SidebarContent.tsx:272-297), not a
              control crammed into the header. */}
          <Pressable
            onPress={toggleAll}
            className="flex-row items-center px-5 py-3"
            accessibilityRole="checkbox"
            accessibilityState={{ checked: allSelected }}
            accessibilityLabel={allSelected ? "Deselect all conversations" : "Select all conversations"}
          >
            {allSelected ? (
              <CheckCircle2 size={20} color={colors.primary} />
            ) : (
              <Circle size={20} color={colors.secondaryText} />
            )}
            <Text className="ml-3 font-sans text-body-md text-primary-text">
              Select All
            </Text>
          </Pressable>
          <View className="h-px bg-border" />
        </>
      ) : (
        <View className="flex-row items-center px-5 pb-1 pt-3">
          <History size={20} color={colors.secondaryText} />
          <Text className="ml-3 font-sans text-body-sm text-secondary-text">
            History
          </Text>
        </View>
      )}

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
        // sticky headers are the issue's grouping shape.
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
            // PocketParity: the menu is the row's ONLY long-press, and it
            // does not exist in selection mode — there, a tap toggles.
            onLongPress={
              selecting
                ? undefined
                : (e) => openRowMenu(item, e as never)
            }
            delayLongPress={350}
            className={`menu-row ${
              item.id === sessionId ? "bg-surface-2" : ""
            }`}
            accessibilityRole="button"
            accessibilityLabel={item.title}
            accessibilityState={{ selected: item.id === sessionId }}
          >
            {selecting ? (
              // Leading checkbox (PocketParity): the row reads as
              // "this is selectable" from its left edge, where a list
              // starts, instead of after the text.
              <View className="mr-3">
                {selected.has(item.id) ? (
                  <CheckCircle2 size={20} color={colors.primary} />
                ) : (
                  <Circle size={20} color={colors.secondaryText} />
                )}
              </View>
            ) : null}
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
            {/* The pin star is the row's only trailing chrome now that
                Pin/Rename/Delete moved into the long-press menu. */}
            {!selecting && item.pinned ? (
              <Star size={14} color={colors.primary} fill={colors.primary} />
            ) : null}
          </Pressable>
        )}
      />

      {/* Row context menu (PocketParity: SidebarContent.tsx:125-192 —
          Pin · divider · Rename · Export · Delete · divider · "Select…",
          anchored at the touch point, absent in selection mode). */}
      {menuSession !== undefined ? (
        <Modal
          visible={menu !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setMenu(null)}
        >
          <Pressable className="flex-1" onPress={() => setMenu(null)}>
            <View
              // Anchored at the finger, clamped so the panel cannot open
              // past the drawer's right edge.
              style={{ position: "absolute", left: Math.max(8, Math.min(menu!.x, 168)), top: menu!.y }}
              className="w-56 overflow-hidden rounded-lg border border-border bg-surface-1"
            >
              <MenuItem
                label={menuSession.pinned ? "Unpin" : "Pin"}
                icon={
                  menuSession.pinned ? (
                    <PinOff size={16} color={colors.secondaryText} />
                  ) : (
                    <Pin size={16} color={colors.secondaryText} />
                  )
                }
                onPress={() => {
                  void onTogglePin(menuSession.id, !menuSession.pinned);
                  setMenu(null);
                }}
              />
              <View className="h-px bg-border" />
              <MenuItem
                label="Rename"
                icon={<Pencil size={16} color={colors.secondaryText} />}
                onPress={() => {
                  setRenaming(menuSession);
                  setDraft(menuSession.title);
                  setMenu(null);
                }}
              />
              <MenuItem
                label="Export"
                icon={<Share size={16} color={colors.secondaryText} />}
                onPress={() => {
                  setMenu(null);
                  void exportIds([menuSession.id]);
                }}
              />
              <MenuItem
                label="Delete"
                icon={<Trash size={16} color={colors.error} />}
                destructive
                onPress={() => {
                  const id = menuSession.id;
                  setMenu(null);
                  onDelete(id);
                }}
              />
              <View className="h-px bg-border" />
              <MenuItem
                label="Select..."
                onPress={() => {
                  const id = menuSession.id;
                  setMenu(null);
                  enterSelectionMode(id);
                }}
              />
            </View>
          </Pressable>
        </Modal>
      ) : null}

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

/** One menu row: 48dp target, label left, icon leading. */
function MenuItem({
  label,
  icon,
  destructive = false,
  onPress,
}: {
  label: string;
  icon?: React.ReactNode;
  destructive?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="menu-row"
      accessibilityRole="menuitem"
      accessibilityLabel={label}
    >
      <View className="mr-3 w-5 items-center">
        {icon ?? null}
      </View>
      <Text
        numberOfLines={1}
        className={`flex-1 font-sans text-body-md ${
          destructive ? "text-error" : "text-primary-text"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}