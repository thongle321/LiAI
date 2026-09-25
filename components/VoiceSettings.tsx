/** Voice output settings: auto-speak, system voice, rate, pitch.
 *
 * System voices via expo-speech (defaults active); neural engines slot
 * into the voice store later without shape changes.
 */

import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type * as Speech from "expo-speech";
import { Check } from "lucide-react-native";

import { colors } from "../themes/tokens.ts";
import { listVoices } from "../lib/voiceSpeak.ts";
import { MAX_PITCH, MAX_RATE, MIN_PITCH, MIN_RATE, useVoice } from "../store/voice.ts";
import { StepperRow, ToggleRow } from "./SettingsRows.tsx";

export function VoiceSettings() {
  const { voiceId, rate, pitch, autoSpeak, load, setVoice, setRate, setPitch, setAutoSpeak } =
    useVoice();
  const [voices, setVoices] = useState<Speech.Voice[]>([]);

  useEffect(() => {
    void load();
    listVoices().then(setVoices, () => setVoices([]));
  }, []);

  return (
    <View className="mb-6">
      <Text className="font-sans-semibold text-h4 text-primary-text mb-1">Voice</Text>
      <ToggleRow label="Speak replies aloud" on={autoSpeak} onPress={() => setAutoSpeak(!autoSpeak)} />
      <StepperRow
        label="Rate"
        display={`${rate.toFixed(2)}x`}
        onMinus={() => setRate(rate - 0.25)}
        onPlus={() => setRate(rate + 0.25)}
        minusDisabled={rate <= MIN_RATE}
        plusDisabled={rate >= MAX_RATE}
      />
      <StepperRow
        label="Pitch"
        display={`${pitch.toFixed(2)}x`}
        onMinus={() => setPitch(pitch - 0.25)}
        onPlus={() => setPitch(pitch + 0.25)}
        minusDisabled={pitch <= MIN_PITCH}
        plusDisabled={pitch >= MAX_PITCH}
      />
      <Text className="font-sans-semibold text-body-sm text-secondary-text mt-2 mb-1">Voice</Text>
      <Pressable onPress={() => setVoice(null)} className="flex-row items-center justify-between py-2.5">
        <Text className="font-sans text-body-md text-primary-text">System default</Text>
        {voiceId === null && <Check size={16} color={colors.primary} />}
      </Pressable>
      {voices.map((v) => (
        <Pressable
          key={v.identifier}
          onPress={() => setVoice(v.identifier)}
          className="flex-row items-center justify-between py-2.5"
        >
          <View className="flex-1">
            <Text className="font-sans text-body-md text-primary-text">{v.name}</Text>
            <Text className="font-sans text-body-sm text-secondary-text/70">{v.language}</Text>
          </View>
          {voiceId === v.identifier && <Check size={16} color={colors.primary} />}
        </Pressable>
      ))}
    </View>
  );
}
