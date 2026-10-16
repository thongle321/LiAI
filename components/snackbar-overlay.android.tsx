/** Android snackbar overlay: the native Material 3 SnackbarHost.
 *
 * Queueing, timing, swipe-to-dismiss and the action button are the
 * platform's; this file only forwards the call and routes
 * `actionPerformed` back to `options.action.onPress`. Styled with LiAI
 * tokens so it reads as one app, not stock Material purple.
 */

import { useImperativeHandle, useRef, type Ref } from "react";
import { View } from "react-native";
import { Host } from "@expo/ui";
import {
  Snackbar as NativeSnackbar,
  SnackbarHost as NativeSnackbarHost,
  type SnackbarHostRef,
} from "@expo/ui/jetpack-compose";

import { colors } from "../themes/tokens.ts";
import type { SnackbarOptions, SnackbarOverlayHandle } from "./snackbar-overlay";

const DEFAULT_DURATION = 4000;

/** Compose has short/long/indefinite; our callers always want auto-dismiss,
 * so indefinite is never used. */
function toNativeDuration(ms: number): "short" | "long" {
  return ms <= 4500 ? "short" : "long";
}

export function SnackbarOverlay({ ref }: { ref?: Ref<SnackbarOverlayHandle> }) {
  const nativeHostRef = useRef<SnackbarHostRef | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      show(message: string, options?: SnackbarOptions) {
        const actionLabel = options?.action?.label;
        const shown = nativeHostRef.current?.showSnackbar({
          message,
          ...(actionLabel ? { actionLabel } : {}),
          // Parity with the iOS fallback's explicit dismiss affordance.
          withDismissAction: true,
          duration: toNativeDuration(options?.duration ?? DEFAULT_DURATION),
        });
        void shown?.then((result) => {
          if (result === "actionPerformed") options?.action?.onPress();
        });
      },
    }),
    [],
  );

  return (
    // Inline offsets, not a className: className offsets on an
    // overlay wrapper have failed to resolve on device before
    // (see FABGroup). Zero-size while idle (matchContents), so it
    // intercepts no touches until a snackbar is showing.
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", left: 16, right: 16, bottom: 16, zIndex: 9999 }}
    >
      {/* matchContents + ignoreSafeArea="keyboard": a zero-size host
          whose content never competes with the app's own keyboard
          handling (expo-ui tip 1 — the host otherwise shifts small
          content on keyboard open/close). */}
      <Host matchContents ignoreSafeArea="keyboard" colorScheme="light" seedColor={colors.primary}>
        <NativeSnackbarHost ref={nativeHostRef}>
          <NativeSnackbar
            containerColor={colors.surface1}
            contentColor={colors.primaryText}
            actionContentColor={colors.primary}
            dismissActionContentColor={colors.secondaryText}
          />
        </NativeSnackbarHost>
      </Host>
    </View>
  );
}
