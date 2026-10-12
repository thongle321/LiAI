/** Voice screen: how LiAI speaks.
 *
 * Structure from the Voice settings reference — a System card on top, then
 * "Downloadable engines" with the free-space reading in the heading, then
 * one expandable card per pack. Colours are this project's tokens, not
 * PocketPal's paper-and-orange.
 *
 * The voice itself is fixed to the System default (see store/voice.ts), so
 * there is no picker here — the engine cards are where choice lives, and
 * each one only offers a voice once its pack is actually installed.
 */

import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { AudioLines, Volume2 } from "lucide-react-native";

import { VoiceEngineCard } from "./voice/VoiceEngineCard.tsx";
import { ActionRow, SettingsSection, ToggleRow } from "./SettingsRows.tsx";
import { DOWNLOADABLE_ENGINES, TTS_PREVIEW_SAMPLE } from "../lib/tts/constants.ts";
import { resolveSystemDefaultVoice } from "../lib/tts/engines/system.ts";
import { speakReply, stopSpeaking } from "../lib/voiceSpeak.ts";
import { formatBytes } from "../lib/models/progress.ts";
import { useTts } from "../store/tts.ts";
import { useVoice } from "../store/voice.ts";
import type { Voice } from "../lib/tts/types.ts";

function EngineHeading() {
  const freeBytes = useTts((s) => s.freeBytes);
  return (
    <View className="mb-3 mt-6 flex-row items-center justify-between">
      <Text className="section-title">Downloadable engines</Text>
      {freeBytes !== null && (
        <Text className="voice-card__spec">{formatBytes(freeBytes)} available</Text>
      )}
    </View>
  );
}

export function VoiceSettings() {
  const { autoSpeak, load, setAutoSpeak } = useVoice();
  const loadEngines = useTts((s) => s.load);
  const [systemVoice, setSystemVoice] = useState<Voice | null>(null);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    void load();
    void loadEngines();
  }, []);

  useEffect(() => {
    let cancelled = false;
    resolveSystemDefaultVoice()
      .then((v) => {
        if (!cancelled) setSystemVoice(v);
      })
      .catch(() => {
        // Enumeration failed; the OS still speaks with its own default, so
        // the card simply stays unnamed rather than blocking the screen.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function togglePreview(): void {
    if (previewing) {
      stopSpeaking();
      setPreviewing(false);
      return;
    }
    setPreviewing(true);
    speakReply(TTS_PREVIEW_SAMPLE, {
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

      {/* System voice — always available, nothing to download. */}
      <View className="voice-card voice-card--active mb-3">
        <View className="voice-card__header">
          <View className="h-9 w-9 items-center justify-center rounded-full bg-orange-100">
            <Volume2 size={18} color="#c2410c" />
          </View>
          <View className="flex-1">
            <Text className="voice-card__title">System voice</Text>
            <Text className="voice-card__spec">Use your device&apos;s default voice</Text>
          </View>
        </View>
        <View className="voice-card__body">
          <View className="mb-3">
            <ActionRow
              label={systemVoice ? systemVoice.name : "Default"}
              description="Always available and works offline."
              buttonLabel={previewing ? "Stop" : "Preview"}
              variant="secondary"
              onPress={togglePreview}
            />
          </View>
        </View>
      </View>

      <EngineHeading />
      <Text className="voice-card__spec mb-3">
        Voice packs are stored on this device. They use storage space.
      </Text>

      {DOWNLOADABLE_ENGINES.map((engine) => (
        <VoiceEngineCard key={engine} engine={engine} />
      ))}

      <Text className="voice-card__spec mt-1 mb-4">Downloaded voices work offline.</Text>

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
    </View>
  );
}