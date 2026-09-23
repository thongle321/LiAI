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
    load: loadUi,
    setVisible,
    setOpen,
    setAllOpen,
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
            onToggleReady={() => setVisible("ready", !readyVisible)}
            onToggleAvailable={() => setVisible("available", !availableVisible)}
            onExpandAll={() => setAllOpen(true)}
            onCollapseAll={() => setAllOpen(false)}
          />
        }
      />
      <View className="flex-1">
        <ScrollView className="flex-1" contentContainerClassName="p-4 pb-[120px]">
          {readyVisible && (
            <ReadyModels
              open={readyOpen}
              onToggle={() => setOpen("ready", !readyOpen)}
              onOpenSettings={setSettingsModelId}
            />
          )}
          {availableVisible && (
            <AvailableModels
              open={availableOpen}
              onToggle={() => setOpen("available", !availableOpen)}
              onDownload={(modelId, file) => startDownload(modelId, file)}
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
            contentContainerClassName="p-4"
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
