/** Long-press menu on a message bubble.
 *
 * Native on both platforms — `@expo/ui/community/menu` resolves to a
 * SwiftUI `ContextMenu` on iOS and a Compose `DropdownMenu` on Android
 * (MenuView.ios.tsx / MenuView.android.tsx inside the package), so there
 * is no platform branch here. The menu anchors to its trigger child, so
 * the trigger is the bubble itself: long-press the text, get the menu.
 *
 * Step 3 of docs/specs/2026-09-29-chat-message-actions-menu.md.
 *
 * **Copy only, deliberately.** PocketPal's menu is Copy · Regenerate ·
 * Regenerate with… · Edit · Report (`pocketpal-ai/.../ChatView.tsx:673-741`)
 * and has **no delete-message action at all** — its destructive branch
 * truncation happens implicitly through edit and regenerate, both of
 * which call `removeMessagesFromId(id, true)`. An earlier draft of this
 * component shipped a Delete item; it was neither in pocketpal nor in
 * the audit, so it was cut (decision Q5).
 *
 * Regenerate / Regenerate with… / Edit arrive in steps 4-6, reusing the
 * `SessionStore.truncateFrom` port method that already exists.
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

export function MessageMenu({
  text,
  settled,
  children,
}: {
  /** Copied verbatim by Copy. */
  text: string;
  /** Streaming turns have no menu: their text is still arriving, so Copy
   * would grab a prefix. Previews and actions have always targeted
   * settled turns only. */
  settled: boolean;
  /** The bubble this menu wraps. */
  children: ReactNode;
}) {
  const { copy } = useCopy();

  if (!settled) return <View>{children}</View>;

  const actions: MenuAction[] = [{ id: COPY, title: "Copy" }];

  return (
    <MenuView
      shouldOpenOnLongPress
      actions={actions}
      onPressAction={(event) => {
        // An id this build does not know: ignore rather than guess.
        if (event.nativeEvent.event === COPY) void copy(text);
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