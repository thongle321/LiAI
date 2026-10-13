/** Composer voice chip.
 *
 * Auto-speak is a per-conversation decision, so its switch belongs where
 * people talk — not only behind Settings → Voice. The speaker half toggles
 * auto-speak; the chevron half opens the Voice screen. Both write the same
 * store value.
 *
 * Ticket 03 / spec Q9: the label comes from the store's current voice —
 * system voices are never enumerated, so the composer pays for no
 * native enumeration call, on any mount.
 */

import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { ChevronDown, Volume2, VolumeX } from "lucide-react-native";

import { useVoice } from "../../store/voice.ts";

export function VoiceChip() {
  const router = useRouter();
  const autoSpeak = useVoice((s) => s.autoSpeak);
  const voice = useVoice((s) => s.currentVoice);
  const setAutoSpeak = useVoice((s) => s.setAutoSpeak);

  const label = voice?.name ?? "Device default voice";

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
