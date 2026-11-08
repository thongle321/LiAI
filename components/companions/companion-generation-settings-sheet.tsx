/** Per-companion generation settings — PocketPal's PalGenerationSettingsSheet.
 *
 *  A companion stores a PARTIAL sampler that layers over the GLOBAL preset at
 *  chat time (store/chat/index.ts: preset → companion tuning). This sheet
 *  resolves its draft the same way, so the values on screen are the ones the
 *  companion layer contributes; resolving over the built-in defaults instead
 *  would show numbers that layer never sees.
 *
 *  Save therefore writes back only the fields that differ from that preset: an
 *  untouched form saves `null`, which is "follow the preset", so a companion
 *  that merely confirms today's values is not pinned against a later preset
 *  change. That is the same partial contract the session override keeps.
 *
 *  PocketPal's shape, kept: a settings-level indicator above the card
 *  ("Custom settings for X" / "Inherited settings for X") and a Reset menu
 *  with three destinations — global, system, and clear — beside one Save.
 *
 *  JINJA is a GLOBAL engine flag in this app (store/inference.ts), not a
 *  per-companion one, so its row is omitted rather than shown as a switch
 *  that cannot do anything.
 */

import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Cog, UserCog } from "lucide-react-native";

import { useColors } from "@/themes/tokens.ts";
import {
  DEFAULT_SAMPLER,
  diffSampler,
  resolveSampler,
  type SamplerParams,
} from "@/services/inference/sampler.ts";
import { loadGlobalPreset } from "@/services/chat/preset.ts";
import { Sheet } from "../sheet.tsx";
import { ResetMenu } from "../reset-menu";
import { SettingsSection } from "../settings-rows.tsx";
import { SamplerRows } from "../chat/sampler-rows.tsx";

export function CompanionGenerationSettingsSheet({
  visible,
  name,
  base,
  onClose,
  onSave,
}: {
  visible: boolean;
  /** The companion's name, for the title and the settings-level indicator. */
  name: string;
  /** The companion's stored partial override; null when it inherits. */
  base: Partial<SamplerParams> | null;
  onClose: () => void;
  /** null clears the companion's override — it follows the preset again. */
  onSave: (settings: Partial<SamplerParams> | null) => void;
}) {
  const colors = useColors();
  const [preset, setPreset] = useState<SamplerParams>(DEFAULT_SAMPLER);
  // Seeded from the companion's own values, not the built-in defaults: the
  // preset read is asynchronous, and showing the defaults until it lands would
  // misreport every field the companion overrides.
  const [draft, setDraft] = useState<SamplerParams>(() =>
    resolveSampler(DEFAULT_SAMPLER, base),
  );
  const [presetLoaded, setPresetLoaded] = useState(false);

  // Re-read the preset on every open: a preset edited since the last visit is
  // what this companion now inherits.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setPresetLoaded(false);
    void (async () => {
      const resolved = await loadGlobalPreset();
      if (cancelled) return;
      setPreset(resolved);
      setDraft(resolveSampler(resolved, base));
      setPresetLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, base]);

  const hasCustomSettings = base != null && Object.keys(base).length > 0;

  /** Only the fields this companion actually overrides are stored, measured
   *  against what it would otherwise get — the preset. Nothing changed means
   *  nothing to store, which is "follow the preset". */
  function save(): void {
    // Before the preset lands, `preset` is still the built-in default, so a
    // diff would report the wrong fields (and an untouched form would return
    // null, silently wiping a real override).
    if (!presetLoaded) return;
    onSave(diffSampler(preset, draft));
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={`Generation Settings - ${name}`}
      testID="companion-generation-settings-sheet"
    >
      {/* PocketPal's SettingsLevelIndicator: a tinted strip saying whose
          settings these are, so "Custom" is never mistaken for "inherited". */}
      <View className="mb-4 flex-row items-center rounded-lg bg-surface-2 px-4 py-2">
        {hasCustomSettings ? (
          <UserCog size={16} color={colors.primary} />
        ) : (
          <Cog size={16} color={colors.primary} />
        )}
        <Text className="ml-2 flex-1 text-quiet">
          {hasCustomSettings
            ? `Custom settings for ${name}`
            : `Inherited settings for ${name}`}
        </Text>
      </View>

      <SettingsSection plain>
        <SamplerRows
          sampler={draft}
          onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
        />
      </SettingsSection>

      <Sheet.Actions>
        <View className="flex-row items-center justify-between">
          {/* PocketPal's Reset menu, same three destinations. The first two
              edit the FORM (Save commits). Clear drops the override from the
              editor's draft and closes this sheet; the editor's own Save is
              what persists it, so Cancel still restores the old settings. */}
          <ResetMenu
            items={[
              {
                label: "Reset to Global Defaults",
                onPress: () => setDraft({ ...preset }),
              },
              {
                label: "Reset to System Defaults",
                onPress: () => setDraft({ ...DEFAULT_SAMPLER }),
              },
              {
                label: "Clear Companion Settings",
                onPress: () => onSave(null),
              },
            ]}
          />
          <Pressable
            onPress={save}
            className="btn btn--primary active:opacity-80"
            style={{
              shadowColor: "#000000",
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.06,
              shadowRadius: 6,
              elevation: 2,
            }}
            accessibilityRole="button"
            accessibilityLabel="Save"
          >
            <Text className="text-action">Save</Text>
          </Pressable>
        </View>
      </Sheet.Actions>
    </Sheet>
  );
}
