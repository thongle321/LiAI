/** One downloadable voice engine, shown as a static card.
 *
 * Placeholder shell: the engine layer that would download and speak these
 * packs is not in the app yet, so the card carries identity only — name,
 * tier badge, and the size/voice facts that belong on it. Nothing here is
 * pressable, because nothing here can be done yet.
 */

import { Text, View } from "react-native";

export interface EngineSummary {
  id: string;
  title: string;
  badge: string;
  voices: number;
  sizeMb: number;
  ramMb: number;
  /** Kitten carries the warm tier chip; the others share the blue one. */
  warm?: boolean;
}

/** Display order, cheapest first. */
export const ENGINES: EngineSummary[] = [
  { id: "kitten", title: "Kitten", badge: "LIGHTWEIGHT", voices: 8, sizeMb: 57, ramMb: 350, warm: true },
  { id: "kokoro", title: "Kokoro", badge: "NATURAL", voices: 22, sizeMb: 330, ramMb: 640 },
  { id: "supertonic", title: "Supertonic", badge: "FAST START", voices: 10, sizeMb: 380, ramMb: 670 },
];

export function VoiceEngineCard({ engine }: { engine: EngineSummary }) {
  return (
    <View className="voice-card mb-3">
      <View className="voice-card__header">
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="voice-card__title">{engine.title}</Text>
            <View className={`voice-badge${engine.warm ? " voice-badge--warm" : ""}`}>
              <Text className="voice-badge__text">{engine.badge}</Text>
            </View>
          </View>
          <Text className="voice-card__spec">
            {`${engine.voices} voices · ${engine.sizeMb} MB · ~${engine.ramMb} MB RAM`}
          </Text>
        </View>
      </View>
    </View>
  );
}