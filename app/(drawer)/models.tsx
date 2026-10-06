/** Models screen: Ready to use + Available to download, header filters, add FAB. */

import { useEffect, useState } from "react";
import { Alert, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { colors } from "../../themes/tokens.ts";
import { ScreenHeader } from "../../components/ScreenHeader.tsx";
import { ContentColumn } from "../../components/ContentColumn.tsx";
import { useLocalModelImport } from "../../hooks/useLocalModelImport.ts";
import { useShallow } from "zustand/shallow";
import { useModelStore } from "../../store/modelStore.ts";
import { useModelsUi } from "../../store/modelsUi.ts";
import { DownloadErrorDialog } from "../../components/models/DownloadErrorDialog.tsx";
import { ModelsHeaderRight } from "../../components/models/ModelsHeaderRight.tsx";
import { FABGroup, FAB_STACK_HEIGHT } from "../../components/models/FABGroup.tsx";
import { ReadyModels } from "../../components/models/ReadyModels.tsx";
import { AvailableModels } from "../../components/models/AvailableModels.tsx";
import { HFModelSearch } from "../../components/models/HFModelSearch.tsx";
import { RemoteModelSheet } from "../../components/models/RemoteModelSheet.tsx";
import { ModelSettingsSheet } from "../../components/models/ModelSettingsSheet.tsx";

export default function ModelsRoute() {
  // Stable selectors: actions never change identity, so each subscribes
  // alone and preset/download writes never re-render this screen.
  const loadPersisted = useModelStore((s) => s.loadPersisted);
  const startDownload = useModelStore((s) => s.startDownload);
  const clearDownloadError = useModelStore((s) => s.clearDownloadError);
  const resumeInterruptedDownload = useModelStore((s) => s.resumeInterruptedDownload);
  // Pull-to-refresh (PocketPal parity): re-stat the disk so rows that
  // finished off-screen snap to their real state, and re-fetch presets.
  const reconcileInterrupted = useModelStore((s) => s.reconcileInterrupted);
  const loadPresets = useModelStore((s) => s.loadPresets);
  const resetModelSettings = useModelStore((s) => s.resetModelSettings);
  // C1: ONE failure slot for the whole screen — the dialog auto-opens
  // from failed store state (PocketPal's dialog reaction), covering
  // every card type that can fail. Narrow stable read: progress ticks
  // re-render nothing unless the failure REASON itself changes.
  const failedDownload = useModelStore(
    useShallow((s) => {
      const failed = s.models.find(
        (m) => m.downloadStatus === "failed" && m.error,
      );
      return failed && failed.error
        ? { id: failed.id, error: failed.error }
        : null;
    }),
  );
  const router = useRouter();
  const importLocalModel = useLocalModelImport();
  // Stable selectors plus one useShallow read set: actions subscribe
  // alone, the accordion/filter flags move as one shallow unit.
  const loadUi = useModelsUi((s) => s.load);
  const setOpen = useModelsUi((s) => s.setOpen);
  const setAllOpen = useModelsUi((s) => s.setAllOpen);
  const setFilter = useModelsUi((s) => s.setFilter);
  const { readyOpen, availableOpen, downloadedOnly, hfOnly, grouped, autoNavigateToChat } =
    useModelsUi(
      useShallow((s) => ({
        readyOpen: s.readyOpen,
        availableOpen: s.availableOpen,
        downloadedOnly: s.downloadedOnly,
        hfOnly: s.hfOnly,
        grouped: s.grouped,
        autoNavigateToChat: s.autoNavigateToChat,
      })),
    );

  useEffect(() => {
    loadPersisted();
    void loadUi();
  }, []);

  const [hfOpen, setHfOpen] = useState(false);
  const [remoteModalOpen, setRemoteModalOpen] = useState(false);
  const [settingsModelId, setSettingsModelId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Both groups self-hide when empty: pocketpal drops filter-empty groups,
  // so a fresh install would show a blank list. This is the empty state.
  // A number selector: re-renders only when the count changes, not on
  // every download-progress tick.
  const catalogCount = useModelStore((s) => s.models.length + s.remoteApis.length);

  async function handleRefresh(): Promise<void> {
    setRefreshing(true);
    try {
      await Promise.all([reconcileInterrupted(), loadPresets()]);
    } finally {
      setRefreshing(false);
    }
  }

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
            onResetModels={() =>
              Alert.alert(
                "Reset models",
                "Restore every model's name, system prompt, and stop words to defaults? Downloaded files are kept.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Reset",
                    style: "destructive",
                    onPress: () => void resetModelSettings(),
                  },
                ],
              )
            }
          />
        }
      />
      <View className="flex-1">
        <ScrollView
          className="flex-1"
          contentContainerClassName="w-full"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void handleRefresh()}
              tintColor={colors.primary}
            />
          }
        >
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
            {catalogCount === 0 ? (
              <View className="items-center py-10">
                <Text className="font-sans text-body-md text-secondary-text text-center">
                  No models yet. Add one from the + button or search Hugging Face.
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

      <HFModelSearch visible={hfOpen} onClose={() => setHfOpen(false)} />

      <RemoteModelSheet visible={remoteModalOpen} onClose={() => setRemoteModalOpen(false)} />

      <ModelSettingsSheet modelId={settingsModelId} onClose={() => setSettingsModelId(null)} />

      <DownloadErrorDialog
        error={failedDownload?.error ?? null}
        onDismiss={() => {
          if (failedDownload !== null) clearDownloadError(failedDownload.id);
        }}
        onRetry={() => {
          if (failedDownload === null) return;
          // Clear first so the dialog closes even when the retry path
          // early-returns (no file); the retry re-opens it on a fresh
          // failure anyway.
          clearDownloadError(failedDownload.id);
          void resumeInterruptedDownload(failedDownload.id);
        }}
      />
    </SafeAreaView>
  );
}
