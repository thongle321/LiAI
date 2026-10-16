/** SnackbarOverlay contract + Metro fallback.
 *
 * Metro resolves `./SnackbarOverlay` to `SnackbarOverlay.ios.tsx` on iOS
 * and `SnackbarOverlay.android.tsx` on Android; nothing on device ever
 * renders this file. It exists so `tsc` (which does not understand
 * platform extensions) has something to resolve, and so both overlays
 * share one handle interface — a method added here must be honored by
 * both platform files.
 */

import type { Ref } from "react";

export type SnackbarType = "info" | "success" | "warning" | "error";

export interface SnackbarAction {
  label: string;
  onPress: () => void;
}

export interface SnackbarOptions {
  type?: SnackbarType;
  /** Auto-dismiss delay in ms. Default 4000. Android maps to short/long. */
  duration?: number;
  action?: SnackbarAction;
  /** iOS fallback only; the native host is always bottom-anchored. */
  position?: "top" | "bottom";
}

export interface SnackbarOverlayHandle {
  show: (message: string, options?: SnackbarOptions) => void;
}

export function SnackbarOverlay({ ref }: { ref?: Ref<SnackbarOverlayHandle> }) {
  void ref;
  return null;
}
