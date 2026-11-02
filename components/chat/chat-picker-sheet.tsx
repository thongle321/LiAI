/** Chat picker: PocketPal's tabbed companion/model sheet in LiAI's shape.
 *
 * PocketPal puts one chevron in the composer (ChatInput.tsx's pal selector)
 * that opens ChatPalModelPickerSheet, whose two tabs are Pals and Models.
 * LiAI had split the same two choices across two sheets and only the model
 * half was reachable from the composer; this reunites them behind that
 * chevron.
 *
 * Parity decisions, taken from the reference:
 * - The sheet opens on Models every time (PocketPal's `activeTab='models'`),
 *   so the empty thread's "Select Model" card and the composer chevron can
 *   share one component.
 * - The tab row carries a tinted pill on the active tab (reference
 *   `activeTab`/`activeTabText`) instead of bare emphasized text.
 * - Companion rows are the reference's flat divider list: name, a
 *   capability subtitle ("Video"/"Assistant" — no PalsHub, so the split is
 *   just the video flag), and a tinted active row; NO per-row borders or
 *   colour stroke. The reference shows a settings gear beside the active
 *   pal instead of a check; management already lives on the Companions
 *   screen here, so the tint alone marks the active row.
 * - "No companion" is the FIRST row and only exists while one is bound,
 *   matching PocketPal's "No Pal / Disable active pal" row.
 * - Picking a companion runs the same activation path as the Companions
 *   screen (default-model resolution included) and closes the sheet.
 *
 * Models come from pickableModels, the same list the header menu and each
 * message's "Regenerate with…" submenu read, so the surfaces cannot disagree
 * about which models exist or which is active. Management stays on the
 * Models and Companions screens, as PocketPal's picker defers to theirs.
 *
 * TrueSheet parity (PocketPal's ChatPalModelPickerSheet):
 * - Fixed 70% detent (not 'auto')
 * - Horizontal paging FlatList for tabs (swipe between Models/Companions)
 * - scrollableRef for each tab's vertical content
 * - enableContentPanningGesture={false} (only grabber moves sheet)
 * - Dismisses keyboard on open (rises from bottom where composer lives)
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Dimensions, FlatList, Pressable, Text, View } from "react-native";
import { KeyboardControllerNative } from "react-native-keyboard-controller";
import { Check, X } from "lucide-react-native";

import { Sheet } from "../sheet.tsx";
import { useColors } from "@/themes/tokens.ts";
import { useActivateCompanion } from "@/hooks/useActivateCompanion.ts";
import { pickableModels } from "@/services/chat/models.ts";
import { useChatStore } from "@/store/chat.ts";
import { ensureCompanionsLoaded, useCompanions } from "@/store/companions.ts";
import { useModelStore } from "@/store/model-store.ts";
import type { Companion } from "@/types/companion.ts";

type Tab = "models" | "companions";

const TABS: { id: Tab; label: string }[] = [
  { id: "companions", label: "Companions" },
  { id: "models", label: "Models" },
];

/** PocketPal's getCapabilityText: the video flag is the only capability its
 *  picker names; everything else reads "Assistant". */
function capabilityText(companion: Companion): string {
  return companion.capabilities?.video ? "Video" : "Assistant";
}

export function ChatPickerSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const colors = useColors();
  const [activeTabIndex, setActiveTabIndex] = useState(1); // 0 = companions, 1 = models (PocketPal default)

  const companions = useCompanions((s) => s.companions);
  const models = useModelStore((s) => s.models);
  const remoteApis = useModelStore((s) => s.remoteApis);
  const activeModelId = useModelStore((s) => s.activeModelId);
  const setActiveModel = useModelStore((s) => s.setActiveModel);
  const setActiveRemoteApi = useModelStore((s) => s.setActiveRemoteApi);

  const sessionId = useChatStore((s) => s.sessionId);
  const sessionCompanionId = useChatStore((s) => s.sessionCompanionId);
  const stagedCompanionId = useChatStore((s) => s.stagedCompanionId);
  const setActiveCompanion = useChatStore((s) => s.setActiveCompanion);
  const activate = useActivateCompanion();

  // The bound companion applies to the open conversation; the staged one to
  // the conversation about to start.
  const effectiveCompanionId =
    sessionId !== null ? sessionCompanionId : stagedCompanionId;

  // Scrollable refs for each tab's vertical content
  const companionsListRef = useRef<FlatList<Companion> | null>(null);
  const modelsListRef = useRef<FlatList<{ id: string; name: string; host?: string; active?: boolean }> | null>(null);

  // Combined scrollableRef for TrueSheet - points to the active tab's list
  const scrollableRef = activeTabIndex === 0 ? companionsListRef : modelsListRef;

  const options = useMemo(() => pickableModels(models, remoteApis, activeModelId), [models, remoteApis, activeModelId]);

  useEffect(() => {
    if (!visible) return;
    setActiveTabIndex(1); // Open on Models tab (PocketPal parity)
    KeyboardControllerNative.dismiss(false, true);
    void ensureCompanionsLoaded();
  }, [visible]);

  function selectModel(id: string, host: string | undefined): void {
    // A local entry has no `host`. Asking `remoteApis.some(...)` instead
    // would be an opposite test on the same list, so the day a local id
    // equalled a remote id the picker would switch as the wrong kind.
    if (host === undefined) setActiveModel(id, "local");
    else setActiveRemoteApi(id);
    onClose();
  }

  const renderTab = (tab: Tab, label: string, index: number) => (
    <Pressable
      key={tab}
      onPress={() => {
        setActiveTabIndex(index);
        pagerRef.current?.scrollToIndex({ index, animated: true });
      }}
      testID={`chat-picker-tab-${tab}`}
      className={`min-h-9 justify-center rounded-lg px-3 py-1 flex-1 items-center ${
        activeTabIndex === index ? "bg-surface-2" : ""
      }`}
      accessibilityRole="tab"
      accessibilityState={{ selected: activeTabIndex === index }}
    >
      <Text
        className={`font-sans text-title ${
          activeTabIndex === index ? "text-primary-text font-sans-semibold" : "text-secondary-text"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );

  const renderCompanionsContent = () => (
    <View className="grow" style={{ width: "100%" }}>
      <FlatList
        ref={companionsListRef}
        data={companions}
        keyExtractor={(c) => c.id}
        renderItem={({ item: companion }) => {
          const selected = companion.id === effectiveCompanionId;
          return (
            <Pressable
              onPress={() => {
                void activate(companion);
                onClose();
              }}
              className={`border-b border-border px-4 py-4 ${selected ? "bg-surface-3 border-primary" : ""}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Use companion ${companion.name}`}
            >
              <Text className="text-body-lg text-primary-text">{companion.name}</Text>
              <Text className="text-body-md text-secondary-text">{capabilityText(companion)}</Text>
            </Pressable>
          );
        }}
        ListHeaderComponent={
          effectiveCompanionId !== null
            ? (
                <Pressable
                  onPress={() => {
                    void setActiveCompanion(null);
                    onClose();
                  }}
                  className="border-b border-border px-4 py-4 active:bg-surface-3"
                  accessibilityRole="button"
                  accessibilityLabel="No companion"
                >
                  <View className="flex-row items-center gap-3">
                    <X size={18} color={colors.primaryText} />
                    <View className="flex-1">
                      <Text className="text-body-lg text-primary-text">No companion</Text>
                      <Text className="text-body-md text-secondary-text">Disable this companion</Text>
                    </View>
                  </View>
                </Pressable>
              )
            : undefined
        }
        ListEmptyComponent={
          companions.length === 0 ? (
            <View className="px-4 py-3">
              <Text className="text-quiet">No companions yet — create one on the Companions screen.</Text>
            </View>
          ) : undefined
        }
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );

  const renderModelsContent = () => (
    <View className="grow" style={{ width: "100%" }}>
      <FlatList
        ref={modelsListRef}
        data={options}
        keyExtractor={(m) => m.id}
        renderItem={({ item: m }) => (
          <Pressable
            onPress={() => selectModel(m.id, m.host)}
            className={`min-h-12 flex-row items-center gap-3 rounded-lg px-4 py-4 ${m.active ? "bg-surface-2" : ""}`}
            accessibilityRole="button"
            accessibilityState={{ selected: m.active }}
            accessibilityLabel={m.host === undefined ? m.name : `${m.name} (${m.host})`}
          >
            <View className="flex-1">
              <Text className="text-body">{m.name}</Text>
              {m.host !== undefined && <Text className="text-quiet">{m.host}</Text>}
            </View>
            {m.active && <Check size={18} color={colors.primary} />}
          </Pressable>
        )}
        ListEmptyComponent={
          options.length === 0 ? (
            <View className="px-1 py-3">
              <Text className="text-quiet">No models are ready yet — download one on the Models screen.</Text>
            </View>
          ) : undefined
        }
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );

  const renderContent = ({ item }: { item: { id: Tab; label: string } }) => (
    <View style={{ width: "100%" }}>
      {item.id === "companions" ? renderCompanionsContent() : renderModelsContent()}
    </View>
  );

  // Horizontal paging FlatList ref for programmatic scrolling
  const pagerRef = useRef<FlatList<{ id: Tab; label: string }> | null>(null);

  // Screen width for getItemLayout (each page = full screen width)
  const screenWidth = Dimensions.get("window").width;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      detents={[0.7]}
      scrollable={false}
      scrollableRef={scrollableRef}
      scrollableOptions={{ scrollingExpandsSheet: false }}
      style={{ flex: 1 }}
    >
      <View className="flex-row h-[50px] items-center gap-2 border-b border-border px-2 pb-0">
        {TABS.map((t, i) => renderTab(t.id, t.label, i))}
      </View>
      <FlatList
        ref={pagerRef}
        data={TABS}
        renderItem={renderContent}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        scrollEnabled={true}
        initialScrollIndex={activeTabIndex}
        getItemLayout={(_, index) => ({ length: screenWidth, offset: screenWidth * index, index })}
        onScroll={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / e.nativeEvent.layoutMeasurement.width);
          if (index !== activeTabIndex) setActiveTabIndex(index);
        }}
      />
    </Sheet>
  );
}