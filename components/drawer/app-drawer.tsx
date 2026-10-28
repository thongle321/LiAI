/** PocketPal-style drawer content, LiAI tokens only.
 *
 * Rendered by the navigator-owned <Drawer> (app/(drawer)/_layout.tsx),
 * which provides the panel slide, scrim, gestures, and back handling —
 * this file is only the panel chrome and footer nav. The history section
 * lives in components/chat/SessionList (the local session list).
 */

import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, usePathname } from "expo-router";
import Constants from "expo-constants";
import {
  CircleHelp,
  MessageCircle,
  Settings,
  Download,
  Mic,
  Users,
  type LucideIcon,
} from "lucide-react-native";

import { useColors } from "@/themes/tokens.ts";
import { useChatStore } from "@/store/chat.ts";
import {
  exportFilename,
  toSessionJson,
} from "@/services/chat/export.ts";
import { readExportSessions } from "@/services/chat/export-read.ts";
import { shareExportedFile } from "@/services/chat/share-export.ts";
import { SessionList } from "../chat/session-list.tsx";

const VERSION = Constants.expoConfig?.version ?? "0.1.0";

export function AppDrawerContent() {
  const colors = useColors();
  const sessionId = useChatStore((s) => s.sessionId);
  const sessions = useChatStore((s) => s.sessions);
  const newConversation = useChatStore((s) => s.newConversation);
  const switchSession = useChatStore((s) => s.switchSession);
  const deleteSession = useChatStore((s) => s.deleteSession);
  const deleteSessions = useChatStore((s) => s.deleteSessions);
  const renameSession = useChatStore((s) => s.renameSession);
  const setPinned = useChatStore((s) => s.setPinned);
  // The highlight is a screen fact, not a store fact: the store keeps the
  // last session loaded while you are on another screen, and drawing it
  // there claims you are reading it. Tapping a row still opens it from
  // anywhere — this only affects the drawn state.
  const onChat = usePathname() === "/chat";

  /** Export exactly these sessions, one JSON per conversation through the
   *  SAME serializer and read path as ChatMenu's single-session export
   *  (toSessionJson + readExportSessions), never a second format.
   *
   *  PocketParity: pocketpal shares ONE file per session, not a bundle
   *  (ChatSessionStore.bulkExportSessions -> exportSessions). The share
   *  sheets are awaited one at a time on purpose — a second sheet opened
   *  over an open one is dropped by the OS, so a fast loop silently loses
   *  every file after the first.
   *  Returns an error message for the drawer's inline notice, or null. */
  async function exportSelected(ids: string[]): Promise<string | null> {
    try {
      for (const id of ids) {
        const session = (await readExportSessions([id]))[0];
        if (session === undefined) continue;
        await shareExportedFile(
          exportFilename(session, "session"),
          toSessionJson(session),
          "session",
        );
      }
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : "Export failed.";
    }
  }

  function go(
    path: "/chat" | "/settings" | "/about" | "/models" | "/companions" | "/voice-settings",
  ): void {
    // ONE navigation, no closeDrawer(): every destination is a screen of
    // the drawer navigator, and its router closes the panel as part of the
    // same state transition as the swap (DrawerRouter getStateForAction /
    // NAVIGATE -> closeDrawer when the index changed). Closing AND pushing
    // in the same tick ran two animations in one frame — the jank.
    router.navigate(path);
  }

  async function openSession(id: string): Promise<boolean> {
    // Opening a conversation is only useful if you can SEE it, so this
    // navigates to the chat screen. Without it the session really does
    // switch in the store, but from Models / Voice / Settings / About the
    // user is left on the screen they came from with no sign the tap did
    // anything. From the chat screen it looked fine, because that is where
    // they already were - which is why this read as intermittent.
    //
    // Switch FIRST, navigate after: going early would mount the chat screen
    // on the PREVIOUS conversation and then swap it out under the user.
    //
    // No id !== sessionId check here: SessionList returns before calling
    // this when the row tapped is already open, so that branch is
    // unreachable from the only caller.
    const ok = await switchSession(id);
    // switchSession answers false for the session ALREADY open as well as
    // for real failures (missing session, no store, failed load). Only the
    // first still means "show me this one": from another screen the
    // navigation is the entire point, so it must not be treated as a
    // refusal to open.
    if (!ok && id !== sessionId) return false;
    go("/chat");
    return true;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface1 }}>
      <View className="flex-1">
        {/* No header row: pocketpal's sidebar starts at the menu (font-size
            mirror Q5=A) — scrim, swipe and back all close the panel. */}
        <View className="flex-1">
          <SessionList
            sessions={sessions}
            sessionId={onChat ? sessionId : null}
            onOpen={(id) => openSession(id)}
            onDelete={(id) => void deleteSession(id)}
            onRename={(id, title) => renameSession(id, title)}
            onTogglePin={(id, pinned) => setPinned(id, pinned)}
            onDeleteMany={(ids) => deleteSessions(ids)}
            onExportSelected={exportSelected}
          />
        </View>

        <View className="border-t border-border">
          {/* Pocketpal's drawer leads its menu with Chat; ours routes it
              AND starts fresh (Q1=A) — the new-conversation entry point. */}
          <DrawerItem
            Icon={MessageCircle}
            label="Chat"
            onPress={() => {
              void newConversation();
              go("/chat");
            }}
          />
          <DrawerItem Icon={Download} label="Models" onPress={() => go("/models")} />
          <DrawerItem Icon={Users} label="Companions" onPress={() => go("/companions")} />
          <DrawerItem Icon={Mic} label="Voice" onPress={() => go("/voice-settings")} />
          <DrawerItem Icon={Settings} label="Settings" onPress={() => go("/settings")} />
          <DrawerItem Icon={CircleHelp} label="About" onPress={() => go("/about")} />
        </View>

        <Text className="border-t border-border px-6 py-3 text-quiet">
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
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      className="min-h-12 flex-row items-center px-6 py-3 active:bg-surface-3"
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Icon size={20} color={colors.secondaryText} />
      <Text className="ml-3 flex-1 font-sans text-body-md text-primary-text">{label}</Text>
    </Pressable>
  );
}
