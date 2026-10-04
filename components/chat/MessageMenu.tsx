/** Long-press menu on a message bubble: Copy and Delete.
 *
 * Native on both platforms — `@expo/ui/community/menu` resolves to a
 * SwiftUI `ContextMenu` on iOS and a Compose `DropdownMenu` on Android
 * (MenuView.ios.tsx / MenuView.android.tsx inside the package), so there
 * is no platform branch here. The menu anchors to its trigger child, so
 * the trigger is the bubble itself: long-press the text, get the menu.
 *
 * Step 3 of docs/specs/2026-09-29-chat-message-actions-menu.md. Edit,
 * Regenerate and Regenerate-with add actions here later; the store port
 * they need (`SessionStore.truncateFrom`) is already in place.
 */

import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";
import MenuView, { type MenuAction } from "@expo/ui/community/menu";

import { useCopy } from "../../hooks/useCopy.ts";

/** Action ids. `onPressAction` reports `action.id ?? action.title`, so
 * every action MUST carry an explicit id — a renamed label must not
 * change what the handler dispatches on. */
const COPY = "copy";
const DELETE = "delete";

export function MessageMenu({
  text,
  settled,
  disabled,
  onDelete,
  children,
}: {
  /** Copied verbatim by Copy. */
  text: string;
  /** Streaming turns have no menu: their text is still arriving, so Copy
   * would grab a prefix and Delete would race the turn. Previews and
   * actions have always targeted settled turns only. */
  settled: boolean;
  /** True while a turn is running: Delete is disabled, because the store
   * refuses to truncate a branch mid-turn and a live-but-dead item is
   * worse than an honest one. */
  disabled: boolean;
  onDelete: () => void;
  /** The bubble this menu wraps. */
  children: ReactNode;
}) {
  const { copy } = useCopy();

  if (!settled) return <View>{children}</View>;

  const actions: MenuAction[] = [
    { id: COPY, title: "Copy" },
    { id: DELETE, title: "Delete", attributes: { destructive: true, disabled } },
  ];

  return (
    <MenuView
      shouldOpenOnLongPress
      actions={actions}
      onPressAction={(event) => {
        switch (event.nativeEvent.event) {
          case COPY:
            void copy(text);
            break;
          case DELETE:
            onDelete();
            break;
          default:
            // An id this build does not know: ignore rather than guess.
            break;
        }
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
      >
        <View>{children}</View>
      </Pressable>
    </MenuView>
  );
}