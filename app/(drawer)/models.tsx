/** Models screen: Ready to use + Available to download, header filters, add FAB. */

import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { colors } from "../../themes/tokens.ts";
import { ScreenHeader } from "../../components/ScreenHeader.tsx";
import { ContentColumn } from "../../components/ContentColumn.tsx";
import { useLocalModelImport } from "../../hooks/useLocalModelImport.ts";
import { useModelStore } from "../../store/modelStore.ts";
import { useModelsUi } from "../../store/modelsUi.ts";
import { ModelsHeaderRight } from "../../components/models/ModelsHeaderRight.tsx";
import { FABGroup, FAB_STACK_HEIGHT } from "../../components/models/FABGroup.tsx";
import { ReadyModels } from "../../components/models/ReadyModels.tsx";
import { AvailableModels } from "../../components/models/AvailableModels.tsx";
import { HFModelSearch } from "../../components/models/HFModelSearch.tsx";
import { RemoteModelSheet } from "../../components/models/RemoteModelSheet.tsx";
import { ModelSettingsSheet } from "../../components/models/ModelSettingsSheet.tsx";

export default function ModelsRoute() {
  const { loadPersisted, startDownload } = useModelStore();
  const router = useRouter();
  const importLocalModel = useLocalModelImport();
  const {
    readyOpen,
    availableOpen,
    downloadedOnly,
    hfOnly,
    grouped,
    load: loadUi,
    setOpen,
    setAllOpen,
    setFilter,
    autoNavigateToChat,
  } = useModelsUi();

  useEffect(() => {
    loadPersisted();
    void loadUi();
  }, []);

  const [hfOpen, setHfOpen] = useState(false);
  const [remoteModalOpen, setRemoteModalOpen] = useState(false);
  const [settingsModelId, setSettingsModelId] = useState<string | null>(null);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.base }}>
      <ScreenHeader
        title="Models"
        right={
          <ModelsHeaderRight
            downloadedOnly={downloadedOnly}
            hfOnly={hfOnly}
            grouped={grouped}
            onToggleFilter={(filter) => {
              const current = { downloadedOnly, hfOnly, grouped };
              setFilter(filter, !current[filter]);
            }}
            onExpandAll={() => setAllOpen(true)}
            onCollapseAll={() => setAllOpen(false)}
          />
        }
      />
      <View className="flex-1">
        <ScrollView className="flex-1" contentContainerClassName="w-full">
          {/* paddingBottom is an inline style, not a class: it is derived from
              FAB_STACK_HEIGHT, and a dynamically-composed Uniwind class has
              failed to resolve on device before (see ModelsHeaderRight). */}
          <ContentColumn className="p-5" style={{ paddingBottom: FAB_STACK_HEIGHT }}>
            <ReadyModels
              open={readyOpen}
              onToggle={(next) => setOpen("ready", next)}
              onOpenSettings={setSettingsModelId}
              // "Auto-Navigate to Chat": activating a model should land
              // you somewhere you can type, not back on a list you now
              // have to leave again.
              onNavigateToChat={
                autoNavigateToChat ? () => router.push("/chat") : undefined
              }
              hfOnly={hfOnly}
            />
            {/* downloadedOnly (PocketPal `downloaded`): only Ready renders. */}
            {!downloadedOnly && (
              <AvailableModels
                open={availableOpen}
                onToggle={(next) => setOpen("available", next)}
                onDownload={(modelId, file) => startDownload(modelId, file)}
                onOpenSettings={(modelId) => setSettingsModelId(modelId)}
                grouped={grouped}
              />
            )}
          </ContentColumn>
        </ScrollView>

        <FABGroup
          onAddHFModel={() => setHfOpen(true)}
          onAddLocalModel={() => void importLocalModel()}
          onAddRemoteModel={() => setRemoteModalOpen(true)}
        />
      </View>

      <HFModelSearch visible={hfOpen} onClose={() => setHfOpen(false)} />

      <RemoteModelSheet visible={remoteModalOpen} onClose={() => setRemoteModalOpen(false)} />

      <ModelSettingsSheet modelId={settingsModelId} onClose={() => setSettingsModelId(null)} />
    </SafeAreaView>
  );
}
