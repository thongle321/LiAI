/** Global snackbar: one instance at the root, any screen or hook can call
 * `showSnackbar(message, options)`.
 *
 * Platform rule: universal @expo/ui where it exists, platform files where
 * it doesn't. There is no cross-platform SnackbarHost (Compose-only), so
 * the overlay is split — `SnackbarOverlay.android.tsx` drives the native
 * Material 3 host, `SnackbarOverlay.ios.tsx` renders the small RN
 * fallback. The public `showSnackbar` signature is identical on both, so
 * call sites never branch.
 */

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  type ReactNode,
} from "react";

import { SnackbarOverlay, type SnackbarOverlayHandle } from "./SnackbarOverlay";
import type { SnackbarAction, SnackbarOptions } from "./SnackbarOverlay";

export type { SnackbarAction, SnackbarOptions };

interface SnackbarContextValue {
  showSnackbar: (message: string, options?: SnackbarOptions) => void;
}

const SnackbarContext = createContext<SnackbarContextValue | null>(null);

export function useSnackbar(): SnackbarContextValue {
  const ctx = useContext(SnackbarContext);
  if (!ctx) throw new Error("useSnackbar must be used within SnackbarProvider");
  return ctx;
}

export function SnackbarProvider({ children }: { children: ReactNode }) {
  const overlayRef = useRef<SnackbarOverlayHandle | null>(null);

  const showSnackbar = useCallback((message: string, options?: SnackbarOptions) => {
    overlayRef.current?.show(message, options);
  }, []);

  return (
    <SnackbarContext.Provider value={{ showSnackbar }}>
      {children}
      <SnackbarOverlay ref={overlayRef} />
    </SnackbarContext.Provider>
  );
}
