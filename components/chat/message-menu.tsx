/** Long-press menu on a message bubble.
 *
 * Native on both platforms — `@expo/ui/community/menu` resolves to a
 * SwiftUI `ContextMenu` on iOS and a Compose `DropdownMenu` on Android
 * (MenuView.ios.tsx / MenuView.android.tsx inside the package), so there
 * is no platform branch here. The menu anchors to its trigger child, so
 * the trigger is the bubble itself: long-press the text, get the menu.
 *
 * The item set is PocketPal's (ChatView.tsx:741-815): Copy, Regenerate,
 * Regenerate with… (model submenu), Edit (user rows only). There is
 * deliberately NO delete-message item and NO report item — see
 * docs/specs/2026-09-29-chat-message-actions-menu.md.
 *
 * Icons are platform-native: SF Symbols on iOS (rendered via the
 * `image` string form) and nothing on Android (the same string is
 * ignored there, per the package's documented caveat). Titles always
 * render on both platforms.
 *
 * ROOT STAYS STABLE. This used to render `<View>{children}</View>` while a
 * turn streamed and `<MenuView>` once it settled. Those are different
 * element types, so React unmounted the whole bubble subtree the moment a
 * reply finished — markdown re-parsed, previews re-fetched, the row
 * visibly flashed. The menu is now ALWAYS the root and only its `actions`
 * are gated on `settled`, so completion is a prop update on the same
 * instance, not a remount. Trade-off: long-pressing a still-streaming
 * bubble opens an empty menu (both platforms) — the gesture has no way to
 * be disabled without swapping the root type again, and it is far cheaper
 * than re-mounting a reply the reader is looking at.
 */

import type { ReactNode } from "react";
import * as Haptics from "expo-haptics";
import MenuView, { type MenuAction } from "@expo/ui/community/menu";

import { useCopy } from "@/hooks/useCopy.ts";
import type { PickableModel } from "@/services/chat/models.ts";

/** Action ids. `onPressAction` reports `action.id ?? action.title`, so
 * every action MUST carry an explicit id — a renamed label must not
 * change what the handler dispatches on. */
const COPY = "copy";
const REGENERATE = "regenerate";
const REGENERATE_WITH = "regenerate-with";
const EDIT = "edit";

export function MessageMenu({
  text,
  settled,
  role,
  canRun,
  models,
  onRegenerate,
  onEdit,
  onRegenerateWith,
  children,
}: {
  /** Copied verbatim by Copy. */
  text: string;
  /** Streaming turns offer no actions: their text is still arriving, so
   * Copy would grab a prefix. This empties the menu; it never changes the
   * element type (see the header comment). */
  settled: boolean;
  role: "user" | "assistant";
  /** A model is loaded. Regenerate and Edit both start a turn, so without
   *  one they are shown but disabled rather than silently doing nothing. */
  canRun: boolean;
  models: PickableModel[];
  /** Optional because a user bubble has nothing to regenerate; the menu
   *  only offers the action where it exists. */
  onRegenerate?: () => void;
  onEdit: () => void;
  onRegenerateWith: (modelId: string) => void;
  /** The bubble this menu wraps. */
  children: ReactNode;
}) {
  const { copy } = useCopy();

  const isUser = role === "user";
  const actions: MenuAction[] = [
    { id: COPY, title: "Copy", image: "doc.on.doc" },
  ];

  if (!isUser) {
    actions.push({
      id: REGENERATE,
      title: "Regenerate",
      image: "arrow.clockwise",
      attributes: { disabled: !canRun },
    });
    if (models.length > 0) {
      actions.push({
        id: REGENERATE_WITH,
        title: "Regenerate with…",
        image: "square.grid.2x2",
        // Deliberately NOT disabled on `!canRun`. PocketPal disables it only
        // while stopping / in voice mode (ChatView.tsx:781), because picking
        // another model is the recovery path when the active one is not
        // loaded — disabling it on model availability would hide the fix
        // exactly when it is needed.
        subactions: models.map((m) => ({
          // The model id is the payload, so the prefix is how one switch
          // dispatches four different answers.
          id: `${REGENERATE_WITH}:${m.id}`,
          title: m.host === undefined ? m.name : `${m.name} (${m.host})`,
          ...(m.active ? { state: "on" as const } : {}),
        })),
      });
    }
  } else {
    actions.push({
      id: EDIT,
      title: "Edit",
      image: "pencil",
      attributes: { disabled: !canRun },
    });
  }

  return (
    <MenuView
      shouldOpenOnLongPress
      // Empty until the turn settles. The trigger still long-presses, but
      // there is nothing to pick from, so a mid-stream menu can't act on a
      // partial reply.
      actions={settled ? actions : []}
      testID="message-menu"
      // Android-only hook (iOS never calls it): fire the haptic exactly
      // once, when the menu actually opens. On iOS the system ContextMenu
      // supplies its own open haptic. Gated on `settled` so the empty
      // mid-stream menu stays silent.
      onOpenMenu={() => {
        if (!settled) return;
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }}
      onPressAction={(event) => {
        const id = event.nativeEvent.event;
        if (id === COPY) {
          void copy(text);
        } else if (id === REGENERATE) {
          onRegenerate?.();
        } else if (id === EDIT) {
          onEdit();
        } else if (id.startsWith(`${REGENERATE_WITH}:`)) {
          onRegenerateWith(id.slice(REGENERATE_WITH.length + 1));
        }
        // An id this build does not know: ignore rather than guess.
      }}
    >
      {/* The bubble itself is the trigger — no wrapper view. One used to sit
          here carrying `accessibilityRole="button"`, which announced an
          activatable control on a node whose activation does nothing: the
          native menu owns the gesture (`ContextMenu` / `DropdownMenu`), and
          neither exposes a programmatic open from JS. The bubble's own text
          is what a screen reader reads. Assistant rows still expose copy and
          read-aloud through their footer; a user row has no accessible copy
          path today, and the button role never gave it one. */}
      {children}
    </MenuView>
  );
}
