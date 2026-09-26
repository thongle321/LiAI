/** Voice output settings: auto-speak, system voice, rate, pitch.
 *
 * No voice picker — the system voice is always used and voices are never
 * enumerated (they run 100+). `speakReply` still reads the store's
 * `voiceId` (always null), keeping the documented slot for a future
 * neural engine; expo-speech uses the system voice when `voice` is unset.
 */

import { useEffect } from "react";
import { Text, View } from "react-native";

import { MAX_PITCH, MAX_RATE, MIN_PITCH, MIN_RATE, useVoice } from "../store/voice.ts";
import { StepperRow, ToggleRow } from "./SettingsRows.tsx";

export function VoiceSettings() {
  const { rate, pitch, autoSpeak, load, setRate, setPitch, setAutoSpeak } = useVoice();

  useEffect(() => {
    void load();
  }, []);

  return (
    <View className="mb-6">
      <Text className="mb-2 font-sans-semibold text-h4 text-primary-text">Voice</Text>
      <View className="rows">
        <View className="row">
          <ToggleRow label="Speak replies aloud" on={autoSpeak} onPress={() => setAutoSpeak(!autoSpeak)} />
        </View>
        <View className="row">
          <StepperRow
            label="Rate"
            display={`${rate.toFixed(2)}x`}
            onMinus={() => setRate(rate - 0.25)}
            onPlus={() => setRate(rate + 0.25)}
            minusDisabled={rate <= MIN_RATE}
            plusDisabled={rate >= MAX_RATE}
          />
        </View>
        <View className="row">
          <StepperRow
            label="Pitch"
            display={`${pitch.toFixed(2)}x`}
            onMinus={() => setPitch(pitch - 0.25)}
            onPlus={() => setPitch(pitch + 0.25)}
            minusDisabled={pitch <= MIN_PITCH}
            plusDisabled={pitch >= MAX_PITCH}
          />
        </View>
      </View>
    </View>
  );
}
