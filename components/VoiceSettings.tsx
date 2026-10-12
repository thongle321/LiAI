/** Voice output settings — auto-speak and the fixed System voice.
 *
 * v2: the voice is no longer user-selectable (the System default English
 * device voice is used), and Rate/Pitch are gone. What remains here is the
 * System half of the Voice screen; the downloadable-engine list is added
 * alongside it once the download path lands.
 */

import { useEffect, useState } from "react";
import { View } from "react-native";

import { useVoice } from "../store/voice.ts";
import { TTS_PREVIEW_SAMPLE } from "../lib/tts/constants.ts";
import { resolveSystemDefaultVoice } from "../lib/tts/engines/system.ts";
import { speakReply, stopSpeaking } from "../lib/voiceSpeak.ts";
import type { Voice } from "../lib/tts/types.ts";
import { ActionRow, SettingsSection, ToggleRow } from "./SettingsRows.tsx";

export function VoiceSettings() {
  const { autoSpeak, load, setAutoSpeak } = useVoice();
  const [systemVoice, setSystemVoice] = useState<Voice | null>(null);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    let cancelled = false;
    resolveSystemDefaultVoice()
      .then((v) => {
        if (!cancelled) setSystemVoice(v);
      })
      .catch(() => {
        // Enumeration failed; the OS still speaks with its own default, so
        // the row simply stays unnamed rather than blocking the screen.
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
    // No `title`: the route's own header already reads "Voice", and a second
    // "Voice" stacked directly beneath it reads as one heading printed twice.
    <SettingsSection description="How replies are read aloud.">
      <View className="row">
        <ToggleRow
          label="Speak replies aloud"
          description="Read new replies aloud as they arrive."
          on={autoSpeak}
          onPress={() => setAutoSpeak(!autoSpeak)}
        />
      </View>
      <View className="row">
        <ActionRow
          label={systemVoice ? systemVoice.name : "System voice"}
          description="Your device's default voice. Always available, works offline."
          buttonLabel={previewing ? "Stop" : "Preview"}
          variant="secondary"
          onPress={togglePreview}
        />
      </View>
    </SettingsSection>
  );
}