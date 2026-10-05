/** The download-failure dialog (issue 01, gap C1) — PocketPal's
 *  `DownloadErrorDialog` ported to LiAI's shapes.
 *
 * Auto-opened by the models screen while any spec sits in
 * `downloadStatus === "failed"` with a reason (PocketPal opens from its
 * store reaction the same way); dismiss CLEARS the reason so the same
 * failure cannot nag, and a re-failure reopens it. Try Again runs the
 * button's own retry path.
 *
 * Copy comes from the ONE taxonomy in lib/models/download-error.ts —
 * this component never re-derives a branch. The modal uses inline
 * styles only for the scrim and the platform `Modal` (both on the
 * AGENTS.md exception list); everything else is Uniwind.
 */

import { Modal, Pressable, Text, View } from "react-native";

import { scrim } from "../../themes/tokens.ts";
import { downloadErrorCopy } from "../../lib/models/download-error.ts";

export function DownloadErrorDialog({
  error,
  onDismiss,
  onRetry,
}: {
  /** The stored failure reason, or null to stay hidden. */
  error: string | null;
  onDismiss: () => void;
  onRetry: () => void;
}) {
  if (error === null) return null;
  const { title, body } = downloadErrorCopy(error);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <View
        className="flex-1 items-center justify-center p-5"
        style={{ backgroundColor: scrim }}
      >
        <View className="w-full rounded-2xl border border-border bg-surface-1 p-5">
          <Text
            accessibilityRole="alert"
            className="mb-2 font-sans-semibold text-body-lg text-primary-text"
          >
            {title}
          </Text>
          <Text className="mb-4 font-sans text-body-md text-secondary-text">
            {body}
          </Text>
          <View className="flex-row gap-2">
            <Pressable
              onPress={onDismiss}
              className="btn btn--secondary flex-1"
              accessibilityRole="button"
              accessibilityLabel="Dismiss download error"
            >
              <Text className="font-sans text-body-md text-primary">Dismiss</Text>
            </Pressable>
            <Pressable
              onPress={onRetry}
              className="btn btn--primary flex-1"
              accessibilityRole="button"
              accessibilityLabel="Try the download again"
            >
              <Text className="font-sans-semibold text-body-md text-on-primary">
                Try Again
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
