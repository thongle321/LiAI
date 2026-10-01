/** Voice output settings: auto-speak, voice choice, rate, pitch.
 *
 * The store's `voiceId` slot existed but nothing ever wrote it, so the
 * system voice was always used. It is now a real choice. The narrowing and
 * ordering rules live in lib/voices.ts (pure, node-tested); this is the UI.
 */

import { useEffect, useState } from "react";
import { View } from "react-native";
import * as Speech from "expo-speech";

import { MAX_PITCH, MAX_RATE, MIN_PITCH, MIN_RATE, useVoice } from "../store/voice.ts";
import {
  deviceLanguage,
  filterVoices,
  SYSTEM_VOICE,
  voiceOptions,
  type DeviceVoice,
} from "../lib/voices.ts";
import { PickerRow, SettingsSection, StepperRow, ToggleRow } from "./SettingsRows.tsx";

export function VoiceSettings() {
  const { rate, pitch, autoSpeak, voiceId, load, setRate, setPitch, setAutoSpeak, setVoice } =
    useVoice();
  const [voices, setVoices] = useState<DeviceVoice[]>([]);
  // "loading" | "failed" | "ok". Kept because the failure is invisible
  // otherwise: the picker falls back to a single System default option and
  // the row still claims voices are installed, so a device that cannot
  // enumerate looks identical to a device with one voice.
  const [enumState, setEnumState] = useState<"loading" | "failed" | "ok">("loading");

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    let cancelled = false;
    Speech.getAvailableVoicesAsync()
      .then((all) => {
        if (cancelled) return;
        setVoices(filterVoices(all, deviceLanguage()));
        setEnumState("ok");
      })
      .catch(() => {
        // No enumeration available. Say so rather than leaving a one-option
        // picker under a description that promises more.
        if (cancelled) return;
        setVoices([]);
        setEnumState("failed");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const byId = new Map(voices.map((v) => [v.identifier, v]));

  return (
    // No `title`: the route's own header already reads "Voice", and a second
    // "Voice" stacked directly beneath it reads as one heading printed twice
    // (compare Settings → "Memory Settings", whose section titles differ from
    // the screen's). The description alone leads the card.
    <SettingsSection
      description="How replies are read aloud."
    >
      <View className="row">
        <ToggleRow
          label="Speak replies aloud"
          description="Read each reply out as it finishes."
          on={autoSpeak}
          onPress={() => setAutoSpeak(!autoSpeak)}
        />
      </View>
      <View className="row">
        <PickerRow
          label="Reading voice"
          description={
            enumState === "loading"
              ? "Looking for voices installed for this device's language."
              : enumState === "failed"
                ? "This device would not report its voices, so only the system default is offered. Replies still read aloud."
                : voices.length === 0
                  ? "No voices are installed for this device's language. Replies will use the system default."
                  : "Voices installed for this device's language."
          }
          options={voiceOptions(voices, voiceId)}
          value={voiceId ?? SYSTEM_VOICE}
          onChange={(id) => setVoice(id === SYSTEM_VOICE ? null : id)}
          displayFor={(id) =>
            id === SYSTEM_VOICE ? "System default" : (byId.get(id)?.name ?? id)
          }
        />
      </View>
      <View className="row">
        <StepperRow
          label="Rate"
          description="How fast the voice reads."
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
          description="Voice pitch. Leave at 1.00 unless you have a reason."
          display={`${pitch.toFixed(2)}x`}
          onMinus={() => setPitch(pitch - 0.25)}
          onPlus={() => setPitch(pitch + 0.25)}
          minusDisabled={pitch <= MIN_PITCH}
          plusDisabled={pitch >= MAX_PITCH}
        />
      </View>
    </SettingsSection>
  );
}
