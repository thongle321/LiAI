/** The react-native-keyboard-controller boundary under Jest.
 *
 *  The package is native (bindings.native throws "doesn't seem to be
 *  linked" the moment a suite imports it), so every screen test that
 *  reaches it needs this stand-in. It covers the app's full import
 *  surface with an idle keyboard — under Jest the keyboard NEVER
 *  animates, matching the idle branch of the contract the app reads
 *  (utils/keyboard.ts):
 *
 *  - `KeyboardProvider` / `useKeyboardState` — app/_layout.tsx bridges
 *    the visibility into store/keyboard.ts; idle is always "not visible".
 *  - `KeyboardChatScrollView` — message-list.tsx's scroll vehicle;
 *    identical to a plain ScrollView that swallows the library's own
 *    custom props.
 *  - `KeyboardControllerNative.dismiss` — message-input.tsx and
 *    chat-picker-sheet.tsx fire it on send.
 *  - `useReanimatedKeyboardAnimation` — hooks/useKeyboardLift.ts reads
 *    `progress`/`height`; idle is progress 0, height 0.
 */

import * as React from "react";
import { ScrollView, type ScrollViewProps } from "react-native";

export const KeyboardControllerNative = {
  dismiss: () => {},
};

export function KeyboardProvider({
  children,
}: {
  children?: React.ReactNode;
}): React.ReactElement {
  return React.createElement(React.Fragment, null, children);
}

/** Selector over the same { isVisible } shape the real hook exposes. */
export function useKeyboardState<T>(
  selector?: (state: { isVisible: boolean }) => T,
): T | undefined {
  return selector?.({ isVisible: false });
}

/** Idle-keyboard contract of useKeyboardLift's only read. */
export function useReanimatedKeyboardAnimation(): {
  progress: { value: number };
  height: { value: number };
} {
  return { progress: { value: 0 }, height: { value: 0 } };
}

/** The app's custom props ride through to nothing under Jest; a plain
 *  ScrollView renders the children it carries. */
export const KeyboardChatScrollView = React.forwardRef<
  React.ComponentRef<typeof ScrollView>,
  ScrollViewProps & Record<string, unknown>
>(function KeyboardChatScrollView(props, ref) {
  // SAFETY: the library's own component extends ScrollView with props RN
  // doesn't know (offset, freeze, blankSpace…), so the config is cast
  // through as never — the boundary forwards everything verbatim.
  return React.createElement(
    ScrollView,
    { ...(props as object), ref } as never,
  );
});
