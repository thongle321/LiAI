/** The composer mic's in-place Whisper download sheet.
 *
 *  Ported from pocketpal-ai src/components/MicSetupSheet as LiAI's English
 *  copy on the shared Sheet: the setup tier's row, one primary button
 *  whose behavior IS the download state — install → disabled while
 *  downloading → retry on failure — and a Cancel that closes WITHOUT
 *  touching a running download (there is no store primitive to cancel
 *  one). `onClosed` fires when the sheet has decided to close; the owner
 *  unmounts on it. No close-X: the auto-close (tier turning ready) and
 *  the unmount would race the dismiss animation.
 */

import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { useAsrStore } from "@/store/asr.ts";
import { setupTierFor } from "@/store/asr.ts";
import { Sheet } from "@/components/sheet.tsx";
import { WhisperModelRow } from "@/components/voice/whisper-model-row.tsx";

export function MicSetupSheet({
  visible,
  onClosed,
}: {
  visible: boolean;
  /** Called once the sheet has finished closing. */
  onClosed: () => void;
}) {
  const [cancelled, setCancelled] = useState(false);
  const tier = useAsrStore((s) => setupTierFor(s.selectedTier, s.downloadStates));
  const state = useAsrStore((s) => s.downloadStates[tier]);
  const downloadModel = useAsrStore((s) => s.downloadModel);
  const retryDownload = useAsrStore((s) => s.retryDownload);

  if (!visible || cancelled) {
    return null;
  }

  return (
    <Sheet
      visible
      title="Set up voice input"
      onClose={onClosed}
      scrollable={false}
      testID="mic-setup-sheet"
    >
      <View className="gap-3">
        <Text className="font-sans text-body-md text-secondary-text">
          One quick download, then you can dictate offline.
        </Text>
        {/* A running download keeps going behind the sheet: Cancel here
            only means "not now", never "stop". */}
        <View className="rounded-2xl bg-surface-2 px-4 py-3">
          <WhisperModelRow tier={tier} testIDPrefix="mic-setup" />
        </View>
        {state === "downloading" ? (
          <Pressable
            disabled
            accessibilityRole="button"
            accessibilityState={{ disabled: true }}
            className="btn btn--secondary btn--disabled"
            accessibilityLabel="Downloading"
            testID="mic-setup-download"
          >
            <Text className="text-body">Downloading…</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => {
              if (state === "error") {
                void retryDownload(tier);
              } else {
                void downloadModel(tier);
              }
            }}
            className="btn btn--primary active:opacity-80"
            accessibilityRole="button"
            accessibilityLabel={state === "error" ? "Retry" : "Download"}
            testID="mic-setup-download"
          >
            <Text className="text-action">
              {state === "error" ? "Retry" : "Download"}
            </Text>
          </Pressable>
        )}
        <Pressable
          onPress={() => {
            setCancelled(true);
            onClosed();
          }}
          className="btn btn--ghost active:opacity-80"
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          testID="mic-setup-cancel"
        >
          <Text className="text-body">Cancel</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}
