/** "Confirm Reset" — the Models-list reset dialog.
 *
 * PocketParity: pocketpal-ai/src/components/ModelsResetDialog/ (structure
 * :22-56, copy :28-45). A Paper Dialog there; ours is a Modal card, because
 * the app has no dialog primitive and the content is three paragraphs — one
 * of them with a bolded word — which an Alert.alert cannot carry.
 *
 * Deliberate divergence: the reference's fourth paragraph ("this cannot be
 * undone") is commented out in its own source (:42-45), so it is not here
 * either. Reset really is reversible in both apps — it only clears
 * overrides — and a warning about a consequence that does not exist is a
 * lie the user has to learn to ignore.
 */

import { Modal, Pressable, Text, View } from "react-native";



export function ModelsResetDialog({
  visible,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      {/* A plain scrim, not a button: a full-screen labelled control is the
          first thing a screen reader lands on and announces as a giant
          "Dismiss, button". The inline backgroundColor is the documented
          Modal exception — same shape as DownloadErrorDialog's scrim, and
          `scrim` is a token value no class can carry. */}
      <Pressable
        className="flex-1 items-center justify-center bg-scrim px-6"
        onPress={onCancel}
      >
        {/* The empty handler claims the responder so a tap on the card does
            not fall through to the scrim's cancel. */}
        <Pressable
          className="w-full max-w-[400px] rounded-2xl bg-surface-1 p-5"
          onPress={() => {}}
          accessibilityViewIsModal
        >
          <Text className="font-sans-semibold text-h4 text-primary-text">
            Confirm Reset
          </Text>
          <Text className="mt-3 font-sans text-body-md text-primary-text">
            {"This will reset model settings ('system prompt', 'chat template', 'temperature', etc.) to their default configuration."}
          </Text>
          <Text className="mt-2 font-sans text-body-md text-primary-text">
            {"- Your downloaded models will "}
            <Text className="font-sans-semibold">not</Text>
            {" be removed."}
          </Text>
          <Text className="mt-2 font-sans text-body-md text-primary-text">
            {"- Your 'Local Models' will remain intact."}
          </Text>
          <View className="mt-5 flex-row items-center justify-end gap-2">
            <Pressable
              onPress={onCancel}
              className="btn btn--secondary"
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text className="font-sans text-body-md text-primary">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              className="btn btn--primary"
              accessibilityRole="button"
              accessibilityLabel="Proceed with Reset"
            >
              <Text className="font-sans text-body-md text-on-primary">
                Proceed with Reset
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
