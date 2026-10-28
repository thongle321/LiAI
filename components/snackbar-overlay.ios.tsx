/** iOS snackbar overlay: small RN fallback.
 *
 * @expo/ui ships no SnackbarHost for SwiftUI, so this is the
 * platform-specific version iOS gets: same shape as the native host
 * (type dot, message, action, X), same queue semantics, driven by the
 * shared `show` handle. Nothing here imports Compose — that stack never
 * loads on iOS.
 */

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeInDown, FadeInUp, FadeOutDown, FadeOutUp } from "react-native-reanimated";
import { X } from "lucide-react-native";

import { useColors, type Colors } from "@/themes/tokens.ts";
import type {
  SnackbarOptions,
  SnackbarOverlayHandle,
  SnackbarType,
} from "./snackbar-overlay";

interface SnackbarItem {
  id: number;
  message: string;
  type: SnackbarType;
  duration: number;
  action?: SnackbarOptions["action"];
  position: "top" | "bottom";
}

const DEFAULT_DURATION = 4000;
const EXIT_DELAY_MS = 250;

/** Snackbar type dot + action colour, from the ACTIVE palette. A module-
 *  scope map would freeze the light values at import time. */
function typeColorFor(colors: Colors, type: SnackbarType): string {
  switch (type) {
    case "info": return colors.primary;
    case "success": return colors.successMark;
    case "warning": return colors.warning;
    case "error": return colors.error;
  }
}

export function SnackbarOverlay({ ref }: { ref?: Ref<SnackbarOverlayHandle> }) {
  const colors = useColors();
  const [current, setCurrent] = useState<SnackbarItem | null>(null);
  const [queue, setQueue] = useState<SnackbarItem[]>([]);
  const idRef = useRef(0);

  useImperativeHandle(
    ref,
    () => ({
      show(message: string, options?: SnackbarOptions) {
        const item: SnackbarItem = {
          id: idRef.current++,
          message,
          type: options?.type ?? "info",
          duration: options?.duration ?? DEFAULT_DURATION,
          action: options?.action,
          position: options?.position ?? "bottom",
        };
        setQueue((q) => [...q, item]);
      },
    }),
    [],
  );

  useEffect(() => {
    if (current || queue.length === 0) return;
    const t = setTimeout(() => {
      setCurrent(queue[0]);
      setQueue((q) => q.slice(1));
    }, EXIT_DELAY_MS);
    return () => clearTimeout(t);
  }, [current, queue]);

  useEffect(() => {
    if (!current) return;
    const t = setTimeout(() => setCurrent(null), current.duration);
    return () => clearTimeout(t);
  }, [current]);

  if (!current) return null;

  const typeColor = typeColorFor(colors, current.type);
  const Entering = current.position === "top" ? FadeInDown : FadeInUp;
  const Exiting = current.position === "top" ? FadeOutUp : FadeOutDown;

  return (
    <Animated.View
      key={current.id}
      entering={Entering.duration(200)}
      exiting={Exiting.duration(200)}
      className={`absolute left-4 right-4 z-[9999] ${current.position === "top" ? "top-4" : "bottom-4"}`}
    >
      <View
        className="surface bg-surface-1 flex-row items-center gap-3 px-4 py-3"
        style={{
          shadowColor: "#000000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.08,
          shadowRadius: 12,
          elevation: 4,
        }}
      >
        <View
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: typeColor }}
        />
        <Text className="flex-1 font-sans text-body-sm text-primary-text">
          {current.message}
        </Text>
        {current.action && (
          <Pressable
            onPress={() => {
              current.action!.onPress();
              setCurrent(null);
            }}
            accessibilityRole="button"
            accessibilityLabel={current.action.label}
          >
            <Text
              className="font-sans-semibold text-body-sm"
              style={{ color: typeColor }}
            >
              {current.action.label}
            </Text>
          </Pressable>
        )}
        <Pressable
          onPress={() => setCurrent(null)}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        >
          <X size={16} color={colors.secondaryText} />
        </Pressable>
      </View>
    </Animated.View>
  );
}
