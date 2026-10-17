/** Models screen: PocketPal's group list — Ready to Use / Available to
 * Download, or one group per model type when `grouped` is on — plus the
 * header filter menu and the add FAB.
 *
 * PocketParity: ModelsScreen.tsx:386-478. The grouping itself is
 * services/models//model-groups.ts; the expansion state is keyed by group key,
 * exactly as the reference keys it (UIStore.ts:28-30). Empty groups are
 * never rendered (:378-384).
 *
 * The list is ONE FlatList over flattened header+card rows, not groups of
 * cards — see flattenModelGroups for why nesting was the worse answer.
 */

import { useEffect, useMemo, useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { colors } from "../../themes/tokens.ts";
import { ScreenHeader } from "../../components/screen-header.tsx";
import { ContentColumn } from "../../components/content-column.tsx";
import { useLocalModelImport } from "../../hooks/useLocalModelImport.ts";
import { useLoadGuard } from "../../hooks/useLoadGuard.ts";
import { useShallow } from "zustand/shallow";
import { useModelStore } from "../../store/modelStore.ts";
import { useChatStore } from "../../store/chat.ts";
import { useModelsUi } from "../../store/modelsUi.ts";
import { isProviderActive } from "../../services/search/model-providers.ts";
import {
  buildModelGroups,
  flattenModelGroups,
  type ModelGroup,
  type ModelRow,
} from "../../services/models/model-groups.ts";
import { DownloadErrorDialog } from "../../components/models/download-error-dialog.tsx";
import { ModelsHeaderRight } from "../../components/models/models-header-right.tsx";
import { FABGroup } from "../../components/models/fab-group.tsx";
import { ModelAccordion } from "../../components/models/model-accordion.tsx";
import { PresetModelCard } from "../../components/models/available-models.tsx";
import { ModelCard, RemoteProviderCard } from "../../components/models/model-card.tsx";
import { HFModelSearch } from "../../components/models/hf-model-search.tsx";
import { RemoteModelSheet } from "../../components/models/remote-model-sheet.tsx";
import { ModelSettingsSheet } from "../../components/models/model-settings-sheet.tsx";
import { ModelsResetDialog } from "../../components/models/models-reset-dialog.tsx";
import type { PresetModelFile } from "../../types/models";

export default function ModelsRoute() {
  // Stable selectors: actions never change identity, so each subscribes
  // alone and preset/download writes never re-render this screen.
  const loadPersisted = useModelStore((s) => s.loadPersisted);
  const startDownload = useModelStore((s) => s.startDownload);
  const clearDownloadError = useModelStore((s) => s.clearDownloadError);
  const retryWithoutToken = useModelStore((s) => s.retryWithoutToken);
  const resumeInterruptedDownload = useModelStore((s) => s.resumeInterruptedDownload);
  // Pull-to-refresh (PocketPal parity): re-stat the disk so rows that
  // finished off-screen snap to their real state, and re-fetch presets.
  const reconcileInterrupted = useModelStore((s) => s.reconcileInterrupted);
  const loadPresets = useModelStore((s) => s.loadPresets);
  const resetModelSettings = useModelStore((s) => s.resetModelSettings);
  const setActiveModel = useModelStore((s) => s.setActiveModel);
  const setActiveRemoteApi = useModelStore((s) => s.setActiveRemoteApi);
  const removeRemoteApi = useModelStore((s) => s.removeRemoteApi);
  const startSpecDownload = useModelStore((s) => s.startSpecDownload);
  const activeHfToken = useModelStore((s) => s.activeHfToken);
  // Unload must free memory, not just detach: point the model store at
  // nothing AND drop the engine's cached context so the next Load reloads.
  const releaseEngine = useChatStore((s) => s.releaseEngine);
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
        ? {
            id: failed.id,
            error: failed.error,
            errorCode: failed.errorCode,
            modelUrl: failed.hfUrl,
          }
        : null;
    }),
  );
  const router = useRouter();
  const importLocalModel = useLocalModelImport();
  const guard = useLoadGuard();
  // Stable selectors plus one useShallow read set: actions subscribe
  // alone, the expansion/filter flags move as one shallow unit.
  const loadUi = useModelsUi((s) => s.load);
  const toggleGroup = useModelsUi((s) => s.toggleGroup);
  const setFilter = useModelsUi((s) => s.setFilter);
  const { expandedGroups, downloadedOnly, hfOnly, grouped, autoNavigateToChat } =
    useModelsUi(
      useShallow((s) => ({
        expandedGroups: s.expandedGroups,
        downloadedOnly: s.downloadedOnly,
        hfOnly: s.hfOnly,
        grouped: s.grouped,
        autoNavigateToChat: s.autoNavigateToChat,
      })),
    );
  const { models, presets, remoteApis, remoteCaps, activeModelId } = useModelStore(
    useShallow((s) => ({
      models: s.models,
      presets: s.presets,
      remoteApis: s.remoteApis,
      remoteCaps: s.remoteCaps,
      activeModelId: s.activeModelId,
    })),
  );

  useEffect(() => {
    loadPersisted();
    void loadUi();
  }, []);

  const [hfOpen, setHfOpen] = useState(false);
  const [remoteModalOpen, setRemoteModalOpen] = useState(false);
  const [settingsModelId, setSettingsModelId] = useState<string | null>(null);
  // PocketParity: the reset lives in its own dialog (ModelsResetDialog), not
  // an inline Alert — its copy is three paragraphs with one bolded word.
  const [resetOpen, setResetOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Both groups self-hide when empty: pocketpal drops filter-empty groups,
  // so a fresh install would show a blank list. This is the empty state.
  const catalogCount = useModelStore((s) => s.models.length + s.remoteApis.length);

  async function handleRefresh(): Promise<void> {
    setRefreshing(true);
    try {
      await Promise.all([reconcileInterrupted(), loadPresets()]);
    } finally {
      setRefreshing(false);
    }
  }

  const groups = useMemo(
    () =>
      buildModelGroups({
        specs: models,
        remotes: remoteApis,
        presets,
        filters: { downloadedOnly, hfOnly, grouped },
      }),
    [models, remoteApis, presets, downloadedOnly, hfOnly, grouped],
  );

  // ONE virtualizer over headers AND cards (flattenModelGroups): a
  // collapsed group's cards are not rows, so they are never mounted and
  // never re-render on a download tick. Rebuilt only when the grouping or
  // the expansion map actually moves.
  const rows = useMemo(
    () => flattenModelGroups(groups, expandedGroups),
    [groups, expandedGroups],
  );

  const specById = useMemo(() => new Map(models.map((m) => [m.id, m])), [models]);
  const presetById = useMemo(() => new Map(presets.map((p) => [p.id, p])), [presets]);
  const remoteById = useMemo(() => new Map(remoteApis.map((r) => [r.id, r])), [remoteApis]);

  function guardedDownload(modelId: string, file: PresetModelFile): void {
    guard(file.size, () => startDownload(modelId, file));
  }

  function renderItem(item: ModelGroup["items"][number], presetDownload: typeof guardedDownload) {
    if (item.kind === "preset") {
      const preset = presetById.get(item.id);
      return preset ? (
        <PresetModelCard
          key={item.id}
          preset={preset}
          onDownload={presetDownload}
        />
      ) : null;
    }
    if (item.kind === "remote") {
      const provider = remoteById.get(item.id);
      return provider ? (
        <RemoteProviderCard
          key={item.id}
          item={provider}
          isActive={isProviderActive(activeModelId, item.id)}
          reachable={remoteCaps[item.id]?.reachable}
          onActivate={() => setActiveRemoteApi(item.id)}
          onRemove={() => removeRemoteApi(item.id)}
        />
      ) : null;
    }
    const spec = specById.get(item.id);
    if (spec === undefined) return null;
    if (spec.downloadStatus === "completed") {
      return (
        <ModelCard
          key={spec.id}
          item={spec}
          isActive={activeModelId === spec.id}
          onActivate={() => {
            setActiveModel(spec.id, "local");
            if (autoNavigateToChat) router.push("/chat");
          }}
          onDeactivate={() => {
            setActiveModel(null);
            releaseEngine();
          }}
          onSettings={() => setSettingsModelId(spec.id)}
        />
      );
    }
    // A pending spec is an HF bookmark: its card offers Download, and the
    // token rides along or a gated repo 401s halfway through.
    return (
      <ModelCard
        key={spec.id}
        item={spec}
        isActive={false}
        onDownload={() => {
          const file = spec.files[0];
          if (!file) return;
          guard(file.size, () =>
            void startSpecDownload(spec, file, activeHfToken() ?? undefined),
          );
        }}
        /* The pending branch renders Download instead of Load/Unload, so
           neither callback is reachable from a bookmark. */
        onActivate={() => {}}
        onDeactivate={() => {}}
        onSettings={() => setSettingsModelId(spec.id)}
      />
    );
  }

  /** One FlatList row. A group header renders as the accordion's own chrome
   *  (its cards are separate rows, not its children); a card renders as
   *  whatever kind it is.
   *
   *  The 24px gap BETWEEN groups rides on the header, not on a wrapper around
   *  the group's cards: with the cards as rows of their own there is no block
   *  left to hang a bottom margin on, and putting the space above every header
   *  but the first reproduces the old rhythm exactly. */
  const renderRow = ({ item: row, index }: { item: ModelRow; index: number }) => {
    if (row.kind === "group") {
      const group = row.group;
      return (
        <ModelAccordion
          title={group.label}
          {...(group.description !== undefined ? { description: group.description } : {})}
          open={expandedGroups[group.key] ?? false}
          onToggle={(next) => toggleGroup(group.key, next)}
          {...(index === 0 ? {} : { className: "mt-6" })}
        />
      );
    }
    return renderItem(row.item, guardedDownload);
  };

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
            onResetModels={() => setResetOpen(true)}
          />
        }
      />
      <View className="flex-1">
        {/* PocketParity: the reference's list items are GROUPS, each an
            accordion wrapping its models (:397-412, :362-376). Ours keeps
            the same on-screen anatomy — a header, then that group's cards —
            but flattens both into ONE row list, because a FlatList whose
            items hold unvirtualized children virtualizes nothing: an open
            group mounted its whole catalog and re-rendered all of it on
            every progress tick. See flattenModelGroups.
            `paddingBottom` is an inline style, not a class: it is derived
            from FAB_STACK_HEIGHT, and a dynamically-composed Uniwind class
            has failed to resolve on device before. */}
        <ContentColumn className="w-full flex-1">
          <FlatList
            data={rows}
            keyExtractor={(row) => row.key}
            renderItem={renderRow}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void handleRefresh()}
                tintColor={colors.primary}
              />
            }
            // The screen gutter, DESIGN.md's `5` step (20px): the models
            // screen was the only list in the app without one, so cards
            // sat flush to the window edge. `MessageList` and onboarding
            // carry the same step as `p-5`; ours is `px-5` because the
            // vertical edges already have single owners — ScreenHeader and
            // the group header above, the runtime FAB reserve below (set
            // inline on the next line, which overrides any class `pb`).
            // A list `pt` would stack a second top inset.
            contentContainerClassName="px-5 pb-[256px]"
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          />
        </ContentColumn>
        {catalogCount === 0 && presets.length === 0 ? (
          <View className="pointer-events-none absolute inset-0 items-center justify-center px-8">
            <Text className="text-center font-sans text-body-md text-secondary-text">
              No models yet. Add one from the + button or search Hugging Face.
            </Text>
          </View>
        ) : null}

        <FABGroup
          onAddHFModel={() => setHfOpen(true)}
          onAddLocalModel={() => void importLocalModel()}
          onAddRemoteModel={() => setRemoteModalOpen(true)}
        />
      </View>

      <HFModelSearch visible={hfOpen} onClose={() => setHfOpen(false)} />

      <RemoteModelSheet visible={remoteModalOpen} onClose={() => setRemoteModalOpen(false)} />

      <ModelSettingsSheet modelId={settingsModelId} onClose={() => setSettingsModelId(null)} />

      <ModelsResetDialog
        visible={resetOpen}
        onCancel={() => setResetOpen(false)}
        onConfirm={() => {
          setResetOpen(false);
          void resetModelSettings();
        }}
      />

      <DownloadErrorDialog
        error={failedDownload?.error ?? null}
        errorCode={failedDownload?.errorCode}
        modelUrl={failedDownload?.modelUrl}
        onDismiss={() => {
          if (failedDownload !== null) clearDownloadError(failedDownload.id);
        }}
        onRetryWithoutToken={
          failedDownload === null
            ? undefined
            : () => {
                clearDownloadError(failedDownload.id);
                void retryWithoutToken(failedDownload.id);
              }
        }
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
