/** Models screen: Ready to use + Available to download, header filters, add FAB. */

import { useEffect, useState } from "react";
import { Modal, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { colors } from "../../themes/tokens.ts";
import { ScreenHeader } from "../ScreenHeader.tsx";
import { ContentColumn } from "../ContentColumn.tsx";
import { useLocalModelImport } from "../../hooks/useLocalModelImport.ts";
import { useModelStore } from "../../store/modelStore";
import { useModelsUi } from "../../store/modelsUi.ts";
import {
  downloadablePresets,
  shouldExplainEmptyContent,
} from "../../lib/models/models-content.ts";
import { ModelsHeaderRight } from "./ModelsHeaderRight.tsx";
import { FABGroup, FAB_STACK_HEIGHT } from "./FABGroup.tsx";
import { ReadyModels } from "./ReadyModels.tsx";
import { AvailableModels } from "./AvailableModels.tsx";
import { HFModelSearch } from "./HFModelSearch.tsx";
import { RemoteModelSheet } from "./RemoteModelSheet.tsx";
import { ModelSettingsSheet } from "./ModelSettingsSheet.tsx";

export function ModelsScreen() {
  const { loadPersisted, startDownload } = useModelStore();
  const models = useModelStore((s) => s.models);
  const remoteApis = useModelStore((s) => s.remoteApis);
  const presets = useModelStore((s) => s.presets);
  const router = useRouter();
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
    autoNavigateToChat,
  } = useModelsUi();

  useEffect(() => {
    loadPersisted();
    void loadUi();
  }, []);

  const [hfOpen, setHfOpen] = useState(false);
  const [remoteModalOpen, setRemoteModalOpen] = useState(false);
  const [settingsModelId, setSettingsModelId] = useState<string | null>(null);

  // Both sections hide themselves when they have nothing to show (an
  // empty "Ready to use (0)" header is dead UI), so the filters can
  // combine into a body with NOTHING in it and no way to tell why —
  // two stale persisted flags did exactly that. Same rules the sections
  // use, so this can never disagree with what they render. Both filters
  // on together is deliberate, so nothing gets said in that case.
  const explainEmpty = shouldExplainEmptyContent({
    readyVisible,
    availableVisible,
    downloadedOnly,
    hfOnly,
    downloadedCount: models.filter(
      (m) =>
        m.origin !== "remote_api" &&
        m.downloadStatus === "completed" &&
        (!hfOnly || m.origin === "huggingface"),
    ).length,
    remoteCount: hfOnly ? 0 : remoteApis.length,
    downloadableCount: downloadablePresets(presets, models).length,
  });

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
        <ScrollView className="flex-1" contentContainerClassName="w-full">
          {/* paddingBottom is an inline style, not a class: it is derived from
              FAB_STACK_HEIGHT, and a dynamically-composed Uniwind class has
              failed to resolve on device before (see ModelsHeaderRight). */}
          <ContentColumn className="p-5" style={{ paddingBottom: FAB_STACK_HEIGHT }}>
            {readyVisible && (
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
            {explainEmpty ? (
              <View className="mt-2">
                <Text className="font-sans-semibold text-h4 text-primary-text">
                  Nothing to show
                </Text>
                <Text className="mt-1 font-sans text-body-md text-secondary-text">
                  {downloadedOnly
                    ? "Downloaded-only is on and nothing is downloaded yet. Turn it off in the header filters, or add a model with the + button."
                    : "No models match the current filters. Add one with the + button, or loosen the filters in the header."}
                </Text>
              </View>
            ) : null}
          </ContentColumn>
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
            contentContainerClassName="w-full"
            keyboardShouldPersistTaps="handled"
          >
            <ContentColumn className="p-5">
              <HFModelSearch onClose={() => setHfOpen(false)} />
            </ContentColumn>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <RemoteModelSheet visible={remoteModalOpen} onClose={() => setRemoteModalOpen(false)} />

      <ModelSettingsSheet modelId={settingsModelId} onClose={() => setSettingsModelId(null)} />
    </SafeAreaView>
  );
}
