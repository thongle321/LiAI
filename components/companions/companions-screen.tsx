/** Companions library screen (PocketPal's PalsScreen, local layer).
 *
 * Sections: the grid of installed companions + an add-companion menu with the two
 * templates (assistant / roleplay — no video template, grilling Q4).
 * Filter chips cover what is meaningful WITHOUT PalsHub: every companion here
 * is local, so the honest split is by tools (which ones carry a pact).
 *
 * "Use" follows PocketPal's activatePalWithModel: bind the companion (staged
 * for an unsent conversation, bound in place otherwise), take its
 * downloaded model when one is free, ask before leaving a different
 * model, then land on Chat.
 */

import { useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Plus, FolderOpen } from "lucide-react-native";

import { colors } from "@/themes/tokens.ts";
import { ScreenHeader } from "@/components/screen-header.tsx";
import { CompanionCard } from "@/components/companions/companion-card.tsx";
import { useActivateCompanion } from "@/hooks/useActivateCompanion.ts";
import { useCompanions, ensureCompanionsLoaded } from "@/store/companions.ts";
import { pickCompanionsFile } from "@/services/companions/share-companions.ts";
import {
  createNewAssistantCompanion,
  createNewRoleplayCompanion,
  type Companion,
} from "@/types/companion.ts";

const GAP = 12;
const MIN_CARD_WIDTH = 160;

type Filter = "all" | "tools" | "no-tools";

export function CompanionsScreen({
  onOpen,
  onCreate,
}: {
  /** Open the editor for an existing companion. */
  onOpen: (companion: Companion) => void;
  /** Open the editor for a fresh template. */
  onCreate: (template: Partial<Companion>) => void;
}) {
  const companions = useCompanions((s) => s.companions);
  const loaded = useCompanions((s) => s.loaded);
  const importCompanions = useCompanions((s) => s.importCompanions);
  const [filter, setFilter] = useState<Filter>("all");
  const { width } = useWindowDimensions();

  useEffect(() => {
    void ensureCompanionsLoaded();
  }, []);

  const columns = Math.max(Math.floor((width - GAP * 2) / MIN_CARD_WIDTH), 1);
  const cardWidth = (width - GAP * 2 - GAP * (columns - 1)) / columns;

  const shown = useMemo(() => {
    if (filter === "all") return companions;
    const withTools = (p: Companion) => (p.pact?.talents.length ?? 0) > 0;
    return companions.filter((p) => (filter === "tools" ? withTools(p) : !withTools(p)));
  }, [companions, filter]);

  const activateCompanion = useActivateCompanion();

  async function useCompanion(companion: Companion): Promise<void> {
    // One orchestrator with the in-chat picker: bind, resolve the model,
    // land on Chat (hooks/useActivateCompanion.ts).
    await activateCompanion(companion);
  }

  function addMenu(): void {
    Alert.alert("New Companion", "Pick a template", [
      {
        text: "Assistant",
        onPress: () => onCreate(createNewAssistantCompanion()),
      },
      {
        text: "Roleplay",
        onPress: () => onCreate(createNewRoleplayCompanion()),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  async function importFromFile(): Promise<void> {
    try {
      const raw = await pickCompanionsFile();
      if (raw === null) return; // cancelled
      const result = await importCompanions(raw);
      Alert.alert(
        result.error === undefined ? "Import complete" : "Import failed",
        result.error ??
          `${result.imported} companion${result.imported === 1 ? "" : "s"} imported.` +
            (result.skipped > 0 ? ` ${result.skipped} skipped.` : ""),
      );
    } catch (err) {
      Alert.alert("Import failed", err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface1 }}>
      <ScreenHeader
        title="Companions"
        right={
          <View className="flex-row items-center">
            <Pressable
              onPress={() => void importFromFile()}
              className="icon-btn"
              accessibilityRole="button"
              accessibilityLabel="Import companions from a file"
              hitSlop={4}
            >
              <FolderOpen size={20} color={colors.primaryText} />
            </Pressable>
            <Pressable
              onPress={addMenu}
              className="icon-btn"
              accessibilityRole="button"
              accessibilityLabel="Create companion"
              hitSlop={4}
            >
              <Plus size={22} color={colors.primaryText} />
            </Pressable>
          </View>
        }
      />
      <View className="flex-row gap-2 px-4 py-3">
        <Chip label="All" active={filter === "all"} onPress={() => setFilter("all")} />
        <Chip
          label="With tools"
          active={filter === "tools"}
          onPress={() => setFilter("tools")}
        />
        <Chip
          label="No tools"
          active={filter === "no-tools"}
          onPress={() => setFilter("no-tools")}
        />
      </View>
      {loaded && shown.length === 0 ? (
        <View className="flex-1 items-center justify-center gap-2 px-8">
          <Text className="text-center text-body-md text-primary-text">
            {filter === "all" ? "No companions yet" : "No companions match this filter"}
          </Text>
          <Text className="text-center text-body-sm text-secondary-text">
            {filter === "all"
              ? "Tap + to create an assistant or roleplay companion. Pip arrives on first launch."
              : "Try another filter."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={shown}
          key={columns}
          numColumns={columns}
          keyExtractor={(p) => p.id}
          contentContainerClassName="gap-3 px-4 pb-6"
          columnWrapperStyle={{ gap: GAP }}
          renderItem={({ item }) => (
            <View style={{ width: cardWidth }}>
              <CompanionCard companion={item} onOpen={() => onOpen(item)} onUse={() => void useCompanion(item)} />
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`min-h-9 rounded-full border px-3 justify-center ${
        active ? "border-primary bg-primary" : "border-border bg-surface-1"
      }`}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      <Text className={active ? "text-body-sm text-on-primary" : "text-body-sm text-primary-text"}>
        {label}
      </Text>
    </Pressable>
  );
}
