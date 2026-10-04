/** Chat warning snackbar (PocketParity G7).
 *
 * PocketPal raises recoverable chat failures through
 * `uiStore.setChatWarning(...)` and shows them in an `ErrorSnackbar`
 * (`ChatScreen.tsx:281-296`), with a severity-scaled auto-dismiss and a
 * Retry action for recoverable faults. The audit counts that whole
 * mechanism under G7, because without it a recoverable failure is
 * indistinguishable from a fatal one — the user is shown the same
 * undismissable card and offered no fix.
 *
 * This is that surface. It is deliberately small: it carries a message, a
 * severity and a recoverable flag, because those are the three things
 * PocketPal's snackbar actually renders. It does NOT carry a stack trace
 * or metadata, since nothing here reads them.
 *
 * It is NOT an error card. An errored message means the turn failed; this
 * means it went through in a state the user should know about.
 */

import { useEffect } from "react";
import { Pressable, Text } from "react-native";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { AlertTriangle, RotateCw, X } from "lucide-react-native";

import { MOTION_DURATION_MS } from "../../lib/motion.ts";
import { colors } from "../../themes/tokens.ts";
import type { ChatWarning } from "../../store/chat/types.ts";

/** Severity-scaled dwell, as PocketPal does: an error is worth more of
 *  the user's attention than a warning. */
const DWELL_MS: Record<ChatWarning["severity"], number> = {
  warning: 4000,
  error: 6000,
};

export function ChatWarningSnackbar({
  warning,
  onDismiss,
  onRetry,
}: {
  warning: ChatWarning | null;
  onDismiss: () => void;
  onRetry?: () => void;
}) {
  // Re-armed whenever the warning changes, so a second identical warning
  // gets its full dwell instead of inheriting a nearly-expired timer.
  useEffect(() => {
    if (warning === null) return;
    const id = setTimeout(onDismiss, DWELL_MS[warning.severity]);
    return () => clearTimeout(id);
  }, [warning, onDismiss]);

  if (warning === null) return null;

  return (
    <Animated.View
      entering={FadeInDown.duration(MOTION_DURATION_MS)}
      exiting={FadeOutDown.duration(MOTION_DURATION_MS)}
      className="mb-2 flex-row items-center gap-2 rounded-lg border border-border bg-surface-1 px-3 py-2"
      // assertive: the turn already went through, so this is not blocking
      // anything -- it just must not be missed.
      accessibilityLiveRegion="assertive"
      accessibilityRole="alert"
    >
      {/* Glyph + words, never colour alone (DESIGN.md). */}
      <AlertTriangle
        size={18}
        color={warning.severity === "error" ? colors.error : colors.warning}
      />
      <Text className="flex-1 font-sans text-body-sm text-primary-text">
        {warning.message}
      </Text>
      {warning.recoverable && onRetry !== undefined && (
        <Pressable
          onPress={() => {
            onDismiss();
            onRetry();
          }}
          className="h-12 min-w-12 flex-row items-center justify-center gap-1 px-2"
          accessibilityRole="button"
          accessibilityLabel="Retry"
        >
          <RotateCw size={16} color={colors.primary} />
          <Text className="font-sans-semibold text-body-sm text-primary">
            Retry
          </Text>
        </Pressable>
      )}
      <Pressable
        onPress={onDismiss}
        className="h-12 w-12 items-center justify-center"
        accessibilityRole="button"
        accessibilityLabel="Dismiss warning"
        hitSlop={4}
      >
        <X size={18} color={colors.secondaryText} />
      </Pressable>
    </Animated.View>
  );
}