/** Composer voice chip.
 *
 * Auto-speak is a per-conversation decision, so its switch belongs where
 * people talk — not only behind Settings → Voice. The speaker half toggles
 * auto-speak; the chevron half opens the Voice screen. Both write the same
 * store value.
 *
 * The name lookup enumerates device voices only when a voice is actually
 * picked; with the System default it isn't needed, and the composer should
 * not pay for a native enumeration call on every mount.
 */

import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import * as Speech from "expo-speech";
import { ChevronDown, Volume2, VolumeX } from "lucide-react-native";

import { filterVoices, deviceLanguage } from "../../lib/voices.ts";
import { useVoice } from "../../store/voice.ts";

/** Matches the picker's own name for "no voice chosen". */
const SYSTEM_VOICE_LABEL = "System default";

export function VoiceChip() {
  const router = useRouter();
  const autoSpeak = useVoice((s) => s.autoSpeak);
  const voiceId = useVoice((s) => s.voiceId);
  const setAutoSpeak = useVoice((s) => s.setAutoSpeak);
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (voiceId === null) {
      setName(null);
      return;
    }
    let cancelled = false;
    Speech.getAvailableVoicesAsync()
      .then((all) => {
        if (cancelled) return;
        const hit = filterVoices(all, deviceLanguage()).find((v) => v.identifier === voiceId);
        // A voice this device no longer has still needs a label; the id is
        // the honest fallback and the picker will offer the real choices.
        setName(hit?.name ?? voiceId);
      })
      .catch(() => {
        if (!cancelled) setName(voiceId);
      });
    return () => {
      cancelled = true;
    };
  }, [voiceId]);

  const label = voiceId === null ? SYSTEM_VOICE_LABEL : (name ?? voiceId);

  return (
    <View className="h-8 flex-row items-center overflow-hidden rounded-full border border-slate-200 bg-white">
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: autoSpeak }}
        accessibilityLabel="Auto-speak responses"
        onPress={() => setAutoSpeak(!autoSpeak)}
        className="h-8 w-9 items-center justify-center"
      >
        {autoSpeak ? <Volume2 size={18} color="#2563eb" /> : <VolumeX size={18} color="#64748b" />}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Voice: ${label}. Open voice settings`}
        onPress={() => router.push("/voice-settings")}
        className="h-8 flex-row items-center gap-1 pl-1 pr-2"
      >
        <Text className="text-caption text-primary-text" numberOfLines={1}>
          {label}
        </Text>
        <ChevronDown size={14} color="#64748b" />
      </Pressable>
    </View>
  );
}