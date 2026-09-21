/** Voice output settings: auto-speak, system voice, rate, pitch.
 *
 * System voices via expo-speech (defaults active); neural engines slot
 * into the voice store later without shape changes.
 */

import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type * as Speech from "expo-speech";
import { Check, Minus, Plus } from "lucide-react-native";

import { colors } from "../themes/tokens.ts";
import { listVoices } from "../lib/voiceSpeak.ts";
import { MAX_PITCH, MAX_RATE, MIN_PITCH, MIN_RATE, useVoice } from "../store/voice.ts";

function ToggleRow({
  label,
  on,
  onPress,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} className="flex-row items-center justify-between py-2.5">
      <Text className="font-sans text-body-md text-primary-text">{label}</Text>
      <View
        className={`w-5 h-5 rounded-md border items-center justify-center ${
          on ? "bg-primary border-primary" : "border-border"
        }`}
      >
        {on && <Check size={14} color={colors.base} />}
      </View>
    </Pressable>
  );
}

function Stepper({
  label,
  value,
  step,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <View className="flex-row items-center justify-between py-2.5">
      <Text className="font-sans text-body-md text-primary-text">{label}</Text>
      <View className="flex-row items-center gap-3">
        <Pressable
          onPress={() => onChange(value - step)}
          disabled={value <= min}
          className="p-2 rounded-lg border border-border"
        >
          <Minus size={16} color={colors.primary} />
        </Pressable>
        <Text className="font-sans text-body-md text-primary-text w-12 text-center">
          {value.toFixed(2)}x
        </Text>
        <Pressable
          onPress={() => onChange(value + step)}
          disabled={value >= max}
          className="p-2 rounded-lg border border-border"
        >
          <Plus size={16} color={colors.primary} />
        </Pressable>
      </View>
    </View>
  );
}

export function VoiceSettings() {
  const { voiceId, rate, pitch, autoSpeak, load, setVoice, setRate, setPitch, setAutoSpeak } =
    useVoice();
  const [voices, setVoices] = useState<Speech.Voice[]>([]);

  useEffect(() => {
    void load();
    listVoices().then(setVoices);
  }, []);

  return (
    <View className="mb-6">
      <Text className="font-sans-semibold text-h4 text-primary-text mb-1">Voice</Text>
      <ToggleRow label="Speak replies aloud" on={autoSpeak} onPress={() => setAutoSpeak(!autoSpeak)} />
      <Stepper label="Rate" value={rate} step={0.25} min={MIN_RATE} max={MAX_RATE} onChange={setRate} />
      <Stepper label="Pitch" value={pitch} step={0.25} min={MIN_PITCH} max={MAX_PITCH} onChange={setPitch} />
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
