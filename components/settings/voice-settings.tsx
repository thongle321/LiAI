/** Voice screen: how LiAI speaks.
 *
 * Rebuilt so the Voice screen matches LiAI's app style: it uses the
 * Settings family helpers (ScreenHeader + ContentColumn at the route), drops
 * the PocketPal "paper panel" wrapper, and renormalises onto the design
 * system's tokens (DESIGN.md). Engine cards keep their disclosure anatomy;
 * only the surface token values changed in global.css.
 */

import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { CloudDownload, Database, Play, Square, Volume2 } from "lucide-react-native";

import { colors } from "../../themes/tokens.ts";
import { cn } from "../../utils/cn.ts";
import { formatBytes } from "../../services/models/progress.ts";
import { useFreeSpacePoll } from "../../hooks/useStorageDisclosure.ts";
import { ENGINE_ORDER } from "../../services/tts/engineMeta.ts";
import { DEVICE_DEFAULT_VOICE } from "../../services/tts/types.ts";
import { VOICE_PREVIEW_SAMPLE } from "../../constants/voice-strings.ts";
import { speakReply, stopSpeaking } from "../../services/voice/voice-speak.ts";
import { EngineCard } from "../voice/engine-card.tsx";
import { RadioDot } from "../voice/radio-dot.tsx";
import { SettingsSection, ToggleRow } from "../settings-rows.tsx";
import { useVoice } from "../../store/voice.ts";

/** The section's storage caption. A real reading, not the design's static
 *  "1.2 GB available": the same poll the model cards use, so freeing space
 *  on the device updates this line without a remount. */
function FreeStorageLine() {
  const { freeBytes, checked } = useFreeSpacePoll(true);
  return (
    <View className="flex-row items-center gap-1">
      <Database size={14} color={colors.secondaryText} />
      <Text className="font-sans text-body-sm text-secondary-text">
        {checked && freeBytes !== null ? `${formatBytes(freeBytes, 1)} available` : "…"}
      </Text>
    </View>
  );
}

export function VoiceSettings() {
  const { currentVoice, autoSpeak, load, setCurrentVoice, setAutoSpeak } = useVoice();
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  // null ≡ never chosen, which IS the device default (spec Q9).
  const systemSelected = currentVoice === null || currentVoice.engine === "system";

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
    <View className="mb-4">
      <SettingsSection>
        <View className="row">
          <ToggleRow
            label="Auto-speak responses"
            description="Read new replies aloud as they arrive."
            on={autoSpeak}
            onPress={() => setAutoSpeak(!autoSpeak)}
          />
        </View>
      </SettingsSection>

      {/* System voice — what the device can already do, zero install. One
          row, the device default: OS voices are never enumerated (Q9), so
          there is no picker here to get wrong. */}
      <View className={systemSelected ? "voice-card voice-card--active mb-3" : "voice-card mb-3"}>
        <Pressable
          onPress={() => setCurrentVoice(DEVICE_DEFAULT_VOICE)}
          accessibilityRole="radio"
          accessibilityState={{ checked: systemSelected }}
          accessibilityLabel="System voice — the device default voice"
          className="voice-card__header"
        >
          <View className="h-9 w-9 items-center justify-center rounded-full bg-orange-100">
            <Volume2 size={18} color={colors.warmAccent} />
          </View>
          <View className="flex-1">
            <View className="flex-row items-center gap-2">
              <Text className="voice-card__title">System voice</Text>
              <View className="voice-badge">
                <Text className="voice-badge__text">Default</Text>
              </View>
            </View>
            <Text className="voice-card__spec">Use your device&apos;s default voice</Text>
          </View>
          <RadioDot checked={systemSelected} />
        </Pressable>
        <View className="voice-card__body">
          <Pressable
            onPress={togglePreview}
            accessibilityRole="button"
            accessibilityLabel={previewing ? "Stop preview" : "Preview the system voice"}
            className={cn("btn btn--tonal flex-row items-center gap-2 self-start", "px-4 py-2")}
          >
            {previewing ? (
              <Square size={14} color={colors.primary} />
            ) : (
              <Play size={14} color={colors.primary} />
            )}
            <Text className="font-sans-semibold text-body-md text-primary">
              {previewing ? "Stop" : "Preview"}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* The downloadable engines, lightest first. */}
      <View className="mb-3 mt-6 flex-row items-end justify-between">
        <View className="flex-1 pr-4">
          <Text className="section-title">Downloadable engines</Text>
          <Text className="mt-1 font-sans text-body-sm text-secondary-text">
            Voice packs are stored on your device. Uses storage space.
          </Text>
        </View>
        <FreeStorageLine />
      </View>

      {ENGINE_ORDER.map((id) => (
        <EngineCard key={id} engineId={id} />
      ))}

      <View className="mt-1 flex-row items-center gap-2">
        <CloudDownload size={14} color={colors.secondaryText} />
        <Text className="font-sans text-body-sm text-secondary-text">
          Downloaded voices work offline
        </Text>
      </View>
    </View>
  );
}