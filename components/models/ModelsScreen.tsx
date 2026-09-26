/** Models screen: Ready to use + Available to download, header filters, add FAB. */

import { useEffect, useState } from "react";
import { Modal, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors } from "../../themes/tokens.ts";
import { ScreenHeader } from "../ScreenHeader.tsx";
import { useLocalModelImport } from "../../hooks/useLocalModelImport.ts";
import { useModelStore } from "../../store/modelStore";
import { useModelsUi } from "../../store/modelsUi.ts";
import { ModelsHeaderRight } from "./ModelsHeaderRight.tsx";
import { FABGroup } from "./FABGroup.tsx";
import { ReadyModels } from "./ReadyModels.tsx";
import { AvailableModels } from "./AvailableModels.tsx";
import { HFModelSearch } from "./HFModelSearch.tsx";
import { RemoteModelSheet } from "./RemoteModelSheet.tsx";
import { ModelSettingsSheet } from "./ModelSettingsSheet.tsx";

export function ModelsScreen() {
  const { loadPersisted, startDownload } = useModelStore();
  const importLocalModel = useLocalModelImport();
  const {
    readyVisible,
    availableVisible,
    readyOpen,
    availableOpen,
    downloadedOnly,
    hfOnly,
    grouped,
    load: loadUi,
    setVisible,
    setOpen,
    setAllOpen,
    setFilter,
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
            readyVisible={readyVisible}
            availableVisible={availableVisible}
            downloadedOnly={downloadedOnly}
            hfOnly={hfOnly}
            grouped={grouped}
            onToggleReady={() => setVisible("ready", !readyVisible)}
            onToggleAvailable={() => setVisible("available", !availableVisible)}
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
        <ScrollView className="flex-1" contentContainerClassName="p-5 pb-[120px]">
          {readyVisible && (
            <ReadyModels
              open={readyOpen}
              onToggle={(next) => setOpen("ready", next)}
              onOpenSettings={setSettingsModelId}
              hfOnly={hfOnly}
            />
          )}
          {/* downloadedOnly (PocketPal `downloaded`): only Ready renders. */}
          {availableVisible && !downloadedOnly && (
            <AvailableModels
              open={availableOpen}
              onToggle={(next) => setOpen("available", next)}
              onDownload={(modelId, file) => startDownload(modelId, file)}
              grouped={grouped}
            />
          )}
        </ScrollView>

        <FABGroup
          onAddHFModel={() => setHfOpen(true)}
          onAddLocalModel={() => void importLocalModel()}
          onAddRemoteModel={() => setRemoteModalOpen(true)}
        />
      </View>

      <Modal visible={hfOpen} animationType="slide" onRequestClose={() => setHfOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.base }}>
          <ScrollView
            className="flex-1"
            contentContainerClassName="p-5"
            keyboardShouldPersistTaps="handled"
          >
            <HFModelSearch onClose={() => setHfOpen(false)} />
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <RemoteModelSheet visible={remoteModalOpen} onClose={() => setRemoteModalOpen(false)} />

      <ModelSettingsSheet modelId={settingsModelId} onClose={() => setSettingsModelId(null)} />
    </SafeAreaView>
  );
}
