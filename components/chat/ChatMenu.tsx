/** Chat screen's overflow menu: PocketPal's seven items, in their order.
 *
 * The panel is the same shape as the models screen's filter menu
 * (ModelsHeaderRight.tsx): a transparent Modal with an absolutely
 * positioned card anchored to its button by measureInWindow. The two
 * submenus DRILL IN rather than floating beside their parent, so nothing
 * has to be measured mid-animation and there is one panel at a time.
 *
 * Items that act on a conversation (duplicate, rename, delete) are hidden
 * when there is none: a brand-new unsent conversation has no session id,
 * and PocketPal gates the same three on its session existing.
 */

import { useRef, useState } from "react";
import {
  Dimensions,
  Keyboard,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated from "react-native-reanimated";
import {
  ChevronLeft,
  ChevronRight,
  Cloud,
  Copy,
  LayoutGrid,
  MoreVertical,
  Pencil,
  Search,
  Settings,
  Share,
  Trash,
  Download,
} from "lucide-react-native";

import { useChatStore, defaultGetStore } from "../../store/chat";
import { useModelStore } from "../../store/modelStore";
import {
  exportFilename,
  toAllSessionsJson,
  toMarkdown,
  toSessionJson,
  type ExportSession,
  type ExportKind,
} from "../../lib/chat/export.ts";
import { usePressFeedback } from "../../lib/motion.ts";
import { useChatImport } from "../../hooks/useChatImport.ts";
import { shareExportedFile } from "../../lib/chat/share-export.ts";
import { pickableModels } from "../../lib/chat/models.ts";
import { colors } from "../../themes/tokens.ts";

type Panel = "menu" | "model" | "export" | "rename";

function MenuRow({
  label,
  icon,
  value,
  chevron,
  destructive,
  disabled,
  onPress,
}: {
  label: string;
  icon?: React.ReactNode;
  value?: string;
  chevron?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      className="menu-row"
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled === true }}
    >
      {icon ? <View className="w-5 items-center">{icon}</View> : <View className="w-5" />}
      <Text
        numberOfLines={1}
        className={`flex-1 mr-2 font-sans text-body-lg ${
          disabled
            ? "text-secondary-text"
            : destructive
              ? "text-error"
              : "text-primary-text"
        }`}
      >
        {label}
      </Text>
      {value !== undefined ? (
        <Text
          numberOfLines={1}
          className="mr-1 font-sans text-body-sm text-secondary-text"
        >
          {value}
        </Text>
      ) : null}
      {chevron ? <ChevronRight size={16} color={colors.secondaryText} /> : null}
    </Pressable>
  );
}

export function ChatMenu({
  onOpenGeneration,
  onOpenSearch,
}: {
  onOpenGeneration: () => void;
  /** Opens the in-conversation search bar fresh (menu can't reflect
   *  toggle state, so the row is a plain "open"). */
  onOpenSearch: () => void;
}) {
  const btnRef = useRef<View | null>(null);
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>("menu");
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggerPress = usePressFeedback();

  const sessionId = useChatStore((s) => s.sessionId);
  const renameSession = useChatStore((s) => s.renameSession);
  const deleteSession = useChatStore((s) => s.deleteSession);
  const duplicateSession = useChatStore((s) => s.duplicateSession);
  const models = useModelStore((s) => s.models);
  const remoteApis = useModelStore((s) => s.remoteApis);
  const activeModelId = useModelStore((s) => s.activeModelId);
  const setActiveModel = useModelStore((s) => s.setActiveModel);
  const setActiveRemoteApi = useModelStore((s) => s.setActiveRemoteApi);
  const importChat = useChatImport();

  const hasSession = sessionId !== null;
  // One source for "which models exist", shared with each message's
  // "Regenerate with…" submenu. A local entry has no `host`; that is the
  // discriminator for both the label and the switching call.
  const pickable = pickableModels(models, remoteApis, activeModelId);

  function close(): void {
    setOpen(false);
    setPanel("menu");
    setError(null);
  }

  function toggle(): void {
    if (open) {
      close();
      return;
    }
    // PocketPal dismisses the keyboard before the menu opens, so the panel
    // is not immediately covered by it.
    Keyboard.dismiss();
    btnRef.current?.measureInWindow((x, y, w, h) => {
      const screenWidth = Dimensions.get("window").width;
      setAnchor({ top: y + h + 4, right: Math.max(8, screenWidth - (x + w)) });
      setOpen(true);
    });
  }

  function run(fn: () => void): void {
    fn();
    close();
  }

  function startRename(): void {
    const current = useChatStore
      .getState()
      .sessions.find((s) => s.id === sessionId);
    setTitle(current?.title ?? "");
    setPanel("rename");
  }

  async function runExport(kind: ExportKind): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const store = await defaultGetStore();
      if (!store) throw new Error("Conversations are not ready yet.");
      const listed = await store.listSessions();
      const ids = kind === "all" ? listed.map((r) => r.id) : sessionId ? [sessionId] : [];
      const sessions: ExportSession[] = [];
      for (const id of ids) {
        const turns = await store.get(id).catch(() => null);
        if (turns === null) continue;
        const row = listed.find((r) => r.id === id);
        sessions.push({
          id,
          title: row?.title ?? "Untitled",
          pinned: row?.pinned ?? false,
          updatedAt: row?.updatedAt ?? Date.now(),
          turns,
        });
      }
      if (sessions.length === 0) throw new Error("There is nothing to export yet.");
      const contents =
        kind === "all"
          ? toAllSessionsJson(sessions)
          : kind === "markdown"
            ? toMarkdown(sessions[0])
            : toSessionJson(sessions[0]);
      // exportFilename ignores the session for "all" — it is a constant,
      // which tests/chat-export.test.ts pins.
      await shareExportedFile(exportFilename(sessions[0], kind), contents, kind);
      close();
    } catch (err) {
      // Sharing a file fails for reasons the user can act on (no share
      // sheet on the device, cache write denied), so it says so rather
      // than vanishing. A CANCELLED share resolves, so it never gets here.
      setError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View ref={btnRef}>
      <Animated.View style={triggerPress.animatedStyle}>
        <Pressable
          onPress={toggle}
          onPressIn={triggerPress.onPressIn}
          onPressOut={triggerPress.onPressOut}
          className="h-12 w-12 items-center justify-center"
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel="Chat menu"
          accessibilityState={{ expanded: open }}
        >
          <MoreVertical size={20} color={colors.primaryText} />
        </Pressable>
      </Animated.View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <Pressable
          className="flex-1"
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Close menu"
        >
          <View
            style={{
              position: "absolute",
              top: anchor?.top ?? 100,
              right: anchor?.right ?? 16,
              width: 264,
            }}
            className="bg-surface-1 border border-border rounded-lg overflow-hidden"
          >
            {panel === "menu" ? (
              <>
                <MenuRow
                  label="Generation settings"
                  icon={<Settings size={16} color={colors.secondaryText} />}
                  chevron
                  onPress={() => run(onOpenGeneration)}
                />
                <MenuRow
                  label="Model"
                  icon={<LayoutGrid size={16} color={colors.secondaryText} />}
                  chevron
                  disabled={pickable.length === 0}
                  onPress={() => setPanel("model")}
                />
                {hasSession ? (
                  <>
                    <View className="h-px bg-border mx-4" />
                    <MenuRow
                      label="Search"
                      icon={<Search size={16} color={colors.secondaryText} />}
                      onPress={() => run(onOpenSearch)}
                    />
                    <MenuRow
                      label="Duplicate chat history"
                      icon={<Copy size={16} color={colors.secondaryText} />}
                      onPress={() =>
                        run(() => {
                          void duplicateSession(sessionId);
                        })
                      }
                    />
                    <MenuRow
                      label="Rename"
                      icon={<Pencil size={16} color={colors.secondaryText} />}
                      onPress={startRename}
                    />
                    <MenuRow
                      label="Delete"
                      icon={<Trash size={16} color={colors.error} />}
                      destructive
                      onPress={() =>
                        run(() => {
                          void deleteSession(sessionId);
                        })
                      }
                    />
                  </>
                ) : null}
                <View className="h-px bg-border mx-4" />
                <MenuRow
                  label="Export"
                  icon={<Share size={16} color={colors.secondaryText} />}
                  chevron
onPress={() => setPanel("export")}
                />
              </>
            ) : null}
            <MenuRow
              label="Import"
              icon={<Download size={16} color={colors.secondaryText} />}
              // NOT gated on hasSession: restoring into an empty app is the
              // main case, and it is exactly the one Export hides behind a
              // session.
              disabled={busy}
              onPress={() => {
                // Close first, or the picker opens behind the sheet.
                close();
                void importChat();
              }}
            />

            {panel === "model" ? (
              <>
                <BackRow label="Model" onPress={() => setPanel("menu")} />
                {pickable.map((m) => {
                  // A local entry has no host; that is the same
                  // discriminator the message menu uses, so the two can
                  // never disagree about what is switchable.
                  const isLocal = m.host === undefined;
                  return (
                    <MenuRow
                      key={m.id}
                      label={isLocal ? m.name : `${m.name} (${m.host})`}
                      icon={
                        isLocal ? undefined : (
                          <Cloud size={16} color={colors.secondaryText} />
                        )
                      }
                      value={m.active ? "Active" : undefined}
                      chevron={isLocal && m.active}
                      onPress={() =>
                        run(() => {
                          if (isLocal) setActiveModel(m.id, "local");
                          else setActiveRemoteApi(m.id);
                        })
                      }
                    />
                  );
                })}
              </>
            ) : null}

            {panel === "export" ? (
              <>
                <BackRow label="Export" onPress={() => setPanel("menu")} />
                <MenuRow
                  label="Export current session"
                  disabled={!hasSession || busy}
                  onPress={() => void runExport("session")}
                />
                <MenuRow
                  label="Export as Markdown"
                  disabled={!hasSession || busy}
                  onPress={() => void runExport("markdown")}
                />
                <MenuRow
                  label="Export all sessions"
                  disabled={busy}
                  onPress={() => void runExport("all")}
                />
              </>
            ) : null}

            {panel === "rename" ? (
              <>
                <BackRow label="Rename" onPress={() => setPanel("menu")} />
                <View className="p-3">
                  <TextInput
                    value={title}
                    onChangeText={setTitle}
                    placeholder="Conversation title"
                    placeholderTextColor={colors.secondaryText}
                    className="input font-sans text-body-md"
                    accessibilityLabel="Conversation title"
                  />
                  <Pressable
                    onPress={() =>
                      run(() => {
                        if (sessionId) void renameSession(sessionId, title.trim());
                      })
                    }
                    disabled={title.trim() === ""}
                    className={
                      title.trim() === "" ? "btn btn--primary opacity-40" : "btn btn--primary"
                    }
                    accessibilityRole="button"
                    accessibilityLabel="Save title"
                  >
                    <Text className="font-sans-semibold text-body-md text-on-primary">
                      Save
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : null}

            {/* One slot for the panel's only transient message: a failure
                the user can act on, or progress while it works. */}
            {busy || error !== null ? (
              <View className="border-t border-border px-4 py-3">
                <Text
                  className={`font-sans text-body-sm ${
                    error !== null ? "text-error" : "text-secondary-text"
                  }`}
                >
                  {error ?? "Preparing your file…"}
                </Text>
              </View>
            ) : null}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function BackRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="menu-row"
      accessibilityRole="button"
      accessibilityLabel={`Back from ${label}`}
    >
      <ChevronLeft size={16} color={colors.secondaryText} />
      <Text className="flex-1 ml-2 font-sans-semibold text-body-md text-primary-text">
        {label}
      </Text>
    </Pressable>
  );
}
