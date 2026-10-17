/** The download-failure dialog (issue 01, gap C1) — PocketPal's
 *  `DownloadErrorDialog` ported to LiAI's shapes.
 *
 * Auto-opened by the models screen while any spec sits in
 * `downloadStatus === "failed"` with a reason (PocketPal opens from its
 * store reaction the same way); dismiss CLEARS the reason so the same
 * failure cannot nag, and a re-failure reopens it. Try Again runs the
 * button's own retry path.
 *
 * Copy comes from the ONE taxonomy in services/models//download-error.ts —
 * this component never re-derives a branch. The modal uses inline
 * styles only for the scrim and the platform `Modal` (both on the
 * AGENTS.md exception list); everything else is Uniwind.
 */

import { Linking, Modal, Pressable, Text, View } from "react-native";

import { downloadErrorCopy } from "../../services/models/download-error.ts";
import type { DownloadErrorCode } from "../../types/models.ts";

export function DownloadErrorDialog({
  error,
  errorCode,
  modelUrl,
  onDismiss,
  onRetry,
  onRetryWithoutToken,
}: {
  /** The stored failure reason, or null to stay hidden. */
  error: string | null;
  /** Machine-readable failure kind, when the UI can offer a real fix. */
  errorCode?: DownloadErrorCode;
  /** Hugging Face page for the model, when known. Powers "View on Hugging
   *  Face" — the licence a 403 asks for is accepted over there. */
  modelUrl?: string;
  onDismiss: () => void;
  onRetry: () => void;
  /** Offered only for "authentication": drop the token and try again. */
  onRetryWithoutToken?: () => void;
}) {
  if (error === null) return null;
  const { title, body, steps } = downloadErrorCopy(error);
  // Only 401 carries this. A 403 means the account cannot read the repo, and
  // retrying without a token cannot grant that — offering the button there
  // would be a dead end dressed up as help.
  const showTokenRecovery = errorCode === "authentication" && onRetryWithoutToken !== undefined;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <View className="flex-1 items-center justify-center bg-scrim p-5">
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
          {steps.length > 0 && (
            <View className="mb-4 gap-1">
              {steps.map((step, index) => (
                <View key={step} className="flex-row gap-2">
                  <Text className="font-sans text-body-md text-secondary-text">
                    {`${index + 1}.`}
                  </Text>
                  <Text className="flex-1 font-sans text-body-md text-secondary-text">
                    {step}
                  </Text>
                </View>
              ))}
            </View>
          )}
          {modelUrl ? (
            <Pressable
              onPress={() => void Linking.openURL(modelUrl).catch(() => {})}
              className="mb-2 min-h-12 w-full items-center"
              accessibilityRole="link"
              accessibilityLabel="View this model on Hugging Face"
            >
              <Text className="text-body">
                View on Hugging Face
              </Text>
            </Pressable>
          ) : null}
          {showTokenRecovery && (
            <Pressable
              onPress={onRetryWithoutToken}
              className="btn btn--secondary active:opacity-80 mb-2 w-full"
              accessibilityRole="button"
              accessibilityLabel="Download again without your Hugging Face token"
            >
              <Text className="text-body">
                Retry without token
              </Text>
            </Pressable>
          )}
          <View className="flex-row gap-2">
            <Pressable
              onPress={onDismiss}
              className="btn btn--secondary active:opacity-80 flex-1"
              accessibilityRole="button"
              accessibilityLabel="Dismiss download error"
            >
              <Text className="text-body">Dismiss</Text>
            </Pressable>
            <Pressable
              onPress={onRetry}
              className="btn btn--primary active:opacity-80 flex-1"
              accessibilityRole="button"
              accessibilityLabel="Try the download again"
            >
              <Text className="text-action">
                Try Again
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
