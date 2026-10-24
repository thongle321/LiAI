/** The composer mic, self-gating.
 *
 *  Ported from pocketpal-ai src/components/MicButton as LiAI's inline mic
 *  block, with the reference's in-place setup: a not-ready press opens the
 *  MicSetupSheet HERE (keyboard dismissed first) instead of navigating
 *  away. The recording-state styling lives on the asr store's captureState,
 *  so the composer doesn't have to track it. Visual: the same circle this
 *  file's inline version rendered — a fill change for live recording,
 *  never an opacity drop.
 *
 *  Cancel or a completed download retire the sheet in place (`onClosed`
 *  unmount); the release note: the sheet's own Cancel never stops a
 *  running download.
 */

import { useEffect, useState } from "react";
import { Keyboard, Pressable } from "react-native";
import { Mic } from "lucide-react-native";

import { useColors } from "@/themes/tokens.ts";
import { useAsrStore } from "@/store/asr.ts";
import { MicSetupSheet } from "@/components/voice/mic-setup-sheet.tsx";

export function MicButton({ onStart }: { onStart: () => void }) {
  const colors = useColors();
  const asrAvailable = useAsrStore((s) => s.asrAvailable);
  const tierReady = useAsrStore((s) => s.isSelectedTierReady);
  const captureState = useAsrStore((s) => s.captureState);
  const [setupOpen, setSetupOpen] = useState(false);

  // Auto-retire: the tier turning ready while the sheet sits open flips the
  // mic to a recorder, and a sheet behind it would be dead weight.
  useEffect(() => {
    if (setupOpen && tierReady) setSetupOpen(false);
  }, [setupOpen, tierReady]);

  if (!asrAvailable) return null;

  const live = captureState === "recording" || captureState === "transcribing";

  return (
    <>
      <Pressable
        onPress={
          tierReady
            ? onStart
            : () => {
                Keyboard.dismiss();
                setSetupOpen(true);
              }
        }
        testID={tierReady ? "mic-button" : "mic-button-setup"}
        className={`h-12 w-12 items-center justify-center rounded-full ${
          live ? "bg-primary" : "bg-surface-3"
        }`}
        accessibilityRole="button"
        accessibilityLabel={
          tierReady
            ? live
              ? "Stop recording"
              : "Start voice input"
            : "Set up voice input"
        }
      >
        <Mic size={20} color={live ? colors.onPrimary : colors.primary} />
      </Pressable>
      {setupOpen && !tierReady && (
        <MicSetupSheet visible onClosed={() => setSetupOpen(false)} />
      )}
    </>
  );
}
