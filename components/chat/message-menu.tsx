/** Long-press menu on a message bubble.
 *
 * Native on both platforms — `@expo/ui/community/menu` resolves to a
 * SwiftUI `ContextMenu` on iOS and a Compose `DropdownMenu` on Android
 * (MenuView.ios.tsx / MenuView.android.tsx inside the package), so there
 * is no platform branch here. The menu anchors to its trigger child, so
 * the trigger is the bubble itself: long-press the text, get the menu.
 *
 * The item set is PocketPal's (ChatView.tsx:673-741): Copy, Regenerate,
 * Regenerate with… · Edit. There is deliberately NO delete-message item —
 * see docs/specs/2026-09-29-chat-message-actions-menu.md; branch
 * truncation happens implicitly through regenerate and edit.
 */

import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
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
  /** Streaming turns have no menu: their text is still arriving, so Copy
   * would grab a prefix. Previews and actions have always targeted
   * settled turns only. */
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

  if (!settled) return <View>{children}</View>;

  const isUser = role === "user";
  const actions: MenuAction[] = [{ id: COPY, title: "Copy" }];

  if (!isUser) {
    actions.push({
      id: REGENERATE,
      title: "Regenerate",
      attributes: { disabled: !canRun },
    });
    if (models.length > 0) {
      actions.push({
        id: REGENERATE_WITH,
        title: "Regenerate with…",
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
      attributes: { disabled: !canRun },
    });
  }

  return (
    <MenuView
      shouldOpenOnLongPress
      actions={actions}
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
      {/* The haptic rides the trigger's own long-press. On Android both
          this and the DropdownMenu fire, which is what we want. On iOS
          the SwiftUI context menu may claim the gesture first, in which
          case there is no open hook to fall back on (`onOpenMenu` is
          @platform android) and the long-press simply has no haptic.
          Unverified on iOS — see the spec's open questions. */}
      <Pressable
        onLongPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }}
        // The trigger is the whole bubble, and a screen reader has no way
        // to know long-press exists unless it is told.
        accessibilityRole="button"
        accessibilityLabel="Message actions"
        accessibilityHint="Long-press for copy, regenerate and edit"
      >
        <View>{children}</View>
      </Pressable>
    </MenuView>
  );
}