/** Voice output settings: auto-speak, system voice, rate, pitch.
 *
 * System voices via expo-speech (defaults active); neural engines slot
 * into the voice store later without shape changes.
 */

import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import type * as Speech from "expo-speech";

import { listVoices } from "../lib/voiceSpeak.ts";
import { MAX_PITCH, MAX_RATE, MIN_PITCH, MIN_RATE, useVoice } from "../store/voice.ts";
import { PickerRow, StepperRow, ToggleRow } from "./SettingsRows.tsx";

/** Sentinel option for "no explicit voice" — the picker needs a string. */
const SYSTEM_DEFAULT = "__system_default";

export function VoiceSettings() {
  const { voiceId, rate, pitch, autoSpeak, load, setVoice, setRate, setPitch, setAutoSpeak } =
    useVoice();
  const [voices, setVoices] = useState<Speech.Voice[]>([]);

  useEffect(() => {
    void load();
    listVoices().then(setVoices, () => setVoices([]));
  }, []);

  const voiceOptions = [SYSTEM_DEFAULT, ...voices.map((v) => v.identifier)];
  const languageOf = (identifier: string): string =>
    voices.find((v) => v.identifier === identifier)?.language ?? "";
  const voiceLabel = (identifier: string): string => {
    const name = voices.find((v) => v.identifier === identifier)?.name ?? identifier;
    const language = languageOf(identifier);
    return language ? `${name} (${language})` : name;
  };

  return (
    <View className="mb-6">
      <Text className="mb-2 font-sans-semibold text-h4 text-primary-text">Voice</Text>
      <View className="rows mb-3">
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
      <Text className="mb-2 mt-1 font-sans-semibold text-body-sm text-secondary-text">Voice</Text>
      <View className="rows">
        <View className="row">
          {/* A voice list runs to 100+ entries, so it is a native menu, not
              an inline list. The picker's single-line label carries the
              language alongside the name. */}
          <PickerRow
            label="Voice"
            options={voiceOptions}
            value={voiceId ?? SYSTEM_DEFAULT}
            onChange={(next) => setVoice(next === SYSTEM_DEFAULT ? null : next)}
            displayFor={(id) => (id === SYSTEM_DEFAULT ? "System default" : voiceLabel(id))}
          />
        </View>
      </View>
    </View>
  );
}
