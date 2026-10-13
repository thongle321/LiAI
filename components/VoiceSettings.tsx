/** Voice screen: how LiAI speaks.
 *
 * Structure from the Voice settings reference — the System voice card on
 * top, then the Kokoro engine group, then auto-speak. Colours are this
 * project's tokens, not PocketPal's paper-and-orange.
 *
 * The Kokoro group (see components/voice/KokoroEngineCard.tsx) is live:
 * download button with progress, the 11 curated voices as radio rows,
 * tap-to-preview. Only engines in the v1 scope (system + kokoro, spec
 * Q2) appear; kitten/supertonic return in phase 2 with their own groups.
 */

import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { AudioLines, Volume2 } from "lucide-react-native";

import { KokoroEngineCard } from "./voice/KokoroEngineCard.tsx";
import { ActionRow, PickerRow, SettingsSection, ToggleRow } from "./SettingsRows.tsx";
import { DEVICE_DEFAULT_VOICE } from "../lib/tts/types.ts";
import { VOICE_PREVIEW_SAMPLE } from "../constants/voice-strings.ts";
import { speakReply, stopSpeaking } from "../lib/voiceSpeak.ts";
import { useVoice } from "../store/voice.ts";

export function VoiceSettings() {
  const { currentVoice, autoSpeak, load, setCurrentVoice, setAutoSpeak } = useVoice();
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  function togglePreview(): void {
    if (previewing) {
      stopSpeaking();
      setPreviewing(false);
      return;
    }
    setPreviewing(true);
    speakReply(VOICE_PREVIEW_SAMPLE, {
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

      {/* System voice — what the device can already do. One row, the
          device default: OS voices are never enumerated (spec Q9). */}
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
              description="The voice your device provides. Voices for other languages come from your device settings."
              options={[DEVICE_DEFAULT_VOICE.id]}
              value={currentVoice?.id ?? DEVICE_DEFAULT_VOICE.id}
              onChange={() => setCurrentVoice(DEVICE_DEFAULT_VOICE)}
              displayFor={() => DEVICE_DEFAULT_VOICE.name}
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

      <Text className="section-title mb-3 mt-6">Neural voice</Text>
      <KokoroEngineCard />

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

      {/* Historical dev smoke test lived here (issue 02 KokoroTracer) — the
          Kokoro group above subsumes it, so the tracer is gone. */}
    </View>
  );
}
