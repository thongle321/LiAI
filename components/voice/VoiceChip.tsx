/** Composer voice chip (PocketPal's VoiceChip).
 *
 * Auto-speak is a per-conversation decision, so its switch belongs where
 * people talk — not only behind Settings → Voice. The speaker half toggles
 * auto-speak; the chevron half opens the Voice screen. Both write the same
 * store value, and the engine release on disable lives in the store, so
 * whichever control the user reaches for has the same effect.
 */

import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { ChevronDown, Volume2, VolumeX } from "lucide-react-native";

import { useVoice } from "../../store/voice.ts";

export function VoiceChip() {
  const router = useRouter();
  const autoSpeak = useVoice((s) => s.autoSpeak);
  const currentVoice = useVoice((s) => s.currentVoice);
  const setAutoSpeak = useVoice((s) => s.setAutoSpeak);

  // No voice chosen means the System default, which always exists — the
  // chip never has a dead state, it just says "System".
  const label = currentVoice?.name ?? "System";

  return (
    <View className="h-8 flex-row items-center overflow-hidden rounded-full border border-slate-200 bg-white">
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: autoSpeak }}
        accessibilityLabel="Auto-speak responses"
        onPress={() => setAutoSpeak(!autoSpeak)}
        className="h-8 w-9 items-center justify-center"
      >
        {autoSpeak ? (
          <Volume2 size={18} color="#2563eb" />
        ) : (
          <VolumeX size={18} color="#64748b" />
        )}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Voice: ${label}. Open voice settings`}
        onPress={() => router.push("/voice-settings")}
        className="h-8 flex-row items-center gap-1 pl-1 pr-2"
      >
        <Text className="text-caption text-primary-text">{label}</Text>
        <ChevronDown size={14} color="#64748b" />
      </Pressable>
    </View>
  );
}