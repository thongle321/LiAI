/** Voice screen: how LiAI speaks.
 *
 * Structure from the Voice settings reference — the System voice card on
 * top, then the engine cards, then auto-speak. Colours are this project's
 * tokens, not PocketPal's paper-and-orange.
 *
 * The engine cards are static placeholders (see VoiceEngineCard): the
 * engine layer that would download and speak those packs is not in the app
 * yet, so the screen deliberately claims nothing about them beyond their
 * identity. Nothing on this screen says "download", because nothing here
 * can.
 */

import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import * as Speech from "expo-speech";
import { AudioLines, Volume2 } from "lucide-react-native";

import { ENGINES, VoiceEngineCard } from "./voice/VoiceEngineCard.tsx";
import { KokoroTracer } from "./voice/KokoroTracer.tsx";
import { ActionRow, PickerRow, SettingsSection, ToggleRow } from "./SettingsRows.tsx";
import {
  deviceLanguage,
  filterVoices,
  SYSTEM_VOICE,
  voiceOptions,
  type DeviceVoice,
} from "../lib/voices.ts";
import { speakReply, stopSpeaking } from "../lib/voiceSpeak.ts";
import { useVoice } from "../store/voice.ts";

/** Spoken by the Preview button, so the user hears the voice they picked
 *  rather than the words they just read. */
const PREVIEW_SAMPLE =
  "Oh, hello there! I've been waiting for you to test me. I sound pretty good!";

export function VoiceSettings() {
  const { voiceId, autoSpeak, load, setVoice, setAutoSpeak } = useVoice();
  const [voices, setVoices] = useState<DeviceVoice[]>([]);
  // "loading" | "failed" | "ok". Kept because the failure is invisible
  // otherwise: the picker falls back to a single System default option and
  // the row still claims voices are installed, so a device that cannot
  // enumerate looks identical to a device with one voice.
  const [enumState, setEnumState] = useState<"loading" | "failed" | "ok">("loading");
  const [previewing, setPreviewing] = useState(false);

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

  function togglePreview(): void {
    if (previewing) {
      stopSpeaking();
      setPreviewing(false);
      return;
    }
    setPreviewing(true);
    speakReply(PREVIEW_SAMPLE, {
      onDone: () => setPreviewing(false),
      onStopped: () => setPreviewing(false),
      onError: () => setPreviewing(false),
    });
  }

  return (
    <View>
      {/* Screen lede. */}
      <View className="mb-4 mt-2 flex-row items-center gap-3">
        <View className="h-11 w-11 items-center justify-center rounded-full bg-blue-50">
          <AudioLines size={22} color="#2563eb" />
        </View>
        <View className="flex-1">
          <Text className="section-title">Voice output</Text>
          <Text className="voice-card__spec">Choose how LiAI speaks</Text>
        </View>
      </View>

      {/* System voice — what the device can already do. */}
      <View className="voice-card voice-card--active mb-3">
        <View className="voice-card__header">
          <View className="h-9 w-9 items-center justify-center rounded-full bg-orange-100">
            <Volume2 size={18} color="#c2410c" />
          </View>
          <View className="flex-1">
            <Text className="voice-card__title">System voice</Text>
            <Text className="voice-card__spec">Use a voice installed on this device</Text>
          </View>
        </View>
        <View className="voice-card__body">
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
            <ActionRow
              label="Preview"
              description="Hear a sample in the selected voice."
              buttonLabel={previewing ? "Stop" : "Play"}
              variant="secondary"
              onPress={togglePreview}
            />
          </View>
        </View>
      </View>

      <Text className="section-title mb-3 mt-6">Voice engines</Text>
      {ENGINES.map((engine) => (
        <VoiceEngineCard key={engine.id} engine={engine} />
      ))}

      <SettingsSection description="How replies are read aloud.">
        <View className="row">
          <ToggleRow
            label="Auto-speak responses"
            description="Read new replies aloud as they arrive."
            on={autoSpeak}
            onPress={() => setAutoSpeak(!autoSpeak)}
          />
        </View>
      </SettingsSection>

      {/* __DEV__-only kokoro smoke test (issue 02); release builds drop it. */}
      {__DEV__ ? <KokoroTracer /> : null}
    </View>
  );
}