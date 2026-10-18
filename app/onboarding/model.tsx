/** Onboarding 2/3 — model: which bundled model fits this phone.
 *
 * RAM-detected tier is pre-selected (manual override is a tap away);
 * downloading is optional — Continue skips straight to done.
 */

import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { colors } from "@/themes/tokens.ts";
import { ContentColumn } from "@/components/content-column.tsx";
import {
  matchTier,
  parseTiers,
  readTotalMemory,
} from "@/services/models/device-tiers.ts";
import tiersJson from "@/assets/device-tiers.json";

// Parsed once: the bundle can't change at runtime, and every render
// re-parsing would be pure waste.
const TIERS = parseTiers(tiersJson);
import { TierCard } from "@/components/onboarding/tier-card.tsx";
import { PresetModelCard } from "@/components/models/available-models.tsx";
import { ModelSettingsSheet } from "@/components/models/model-settings-sheet.tsx";
import { presetPrimaryFile, presetSpecView } from "@/services/models/preset-spec.ts";
import { useLoadGuard } from "@/hooks/useLoadGuard.ts";
import { useModelStore } from "@/store/modelStore";
import type { ModelSpec, PresetModel } from "@/types/models";

export default function ModelStep() {
  const tiers = TIERS;
  const [selectedId, setSelectedId] = useState(tiers[0].id);
  const [ramUnknown, setRamUnknown] = useState(false);
  // Stable selectors plus one useShallow read: actions subscribe alone,
  // the preset list re-renders only when presets themselves change.
  const startDownload = useModelStore((s) => s.startDownload);
  const presets = useModelStore((s) => s.presets);
  // The same card as the models screen, so it needs the same store rows.
  const models = useModelStore((s) => s.models);
  const guard = useLoadGuard();
  // The card carries a settings gear (PocketPal parity), so the gear works
  // here too rather than being a dead button in a short flow.
  const [settingsModel, setSettingsModel] = useState<ModelSpec | null>(null);

  useEffect(() => {
    // Hydration already happened in app/index.tsx before onboarding was
    // routed to, so the preset list below is populated (D3-3).
    void readTotalMemory().then((bytes) => {
      if (bytes === null) {
        setRamUnknown(true);
        return;
      }
      setSelectedId(matchTier(bytes, tiers).id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tier = tiers.find((t) => t.id === selectedId) ?? tiers[0];
  const tierPresets = presets.filter((p) => tier.presetIds.includes(p.id));

  // The card's one Download button fetches presetPrimaryFile — the catalog's
  // own rule, shared with the models screen.
  function downloadPreset(preset: PresetModel): void {
    const file = presetPrimaryFile(preset);
    if (!file) return;
    guard(file.size, () => void startDownload(preset.id, file));
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.base }}>
      <ScrollView
        contentContainerClassName="w-full"
        automaticallyAdjustKeyboardInsets
        >
        <ContentColumn className="p-5">
        <Text className="font-sans-semibold text-h2 text-primary-text">
          Pick your model
        </Text>
        {/* On-device is the product's core claim (ADR-0008) — the old copy
            said models "run on LiAI's server", which is simply not true. */}
        <Text className="mt-2 text-quiet">
          Your model runs entirely on this phone. Bigger is smarter and slower —
          start with the highlighted tier.
        </Text>
        {ramUnknown && (
          <Text className="mt-2 text-quiet">
            Couldn't read this phone's memory — showing the lightest tier.
          </Text>
        )}
        <View className="mt-4">
          {tiers.map((t) => (
            <TierCard
              key={t.id}
              tier={t}
              selected={t.id === selectedId}
              recommended={t.id === selectedId && !ramUnknown}
              onSelect={() => setSelectedId(t.id)}
            />
          ))}
        </View>
        {tierPresets.map((preset) => (
          <PresetModelCard
            key={preset.id}
            preset={preset}
            onDownload={() => downloadPreset(preset)}
            onSettings={() => setSettingsModel(presetSpecView(preset, models))}
          />
        ))}
        <Pressable
          onPress={() => router.replace("/onboarding/done")}
          className="btn btn--primary active:opacity-80 mt-4"
          accessibilityRole="button"
          accessibilityLabel="Continue"
        >
          <Text className="text-center text-action">
            Continue
          </Text>
        </Pressable>
        </ContentColumn>
      </ScrollView>

      <ModelSettingsSheet
        model={settingsModel}
        onClose={() => setSettingsModel(null)}
      />
    </SafeAreaView>
  );
}
