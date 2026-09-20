/** Models screen: Ready to use / Available to download groups, HF search, remote APIs. */

import { useEffect, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Globe,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react-native";

import { colors, spacing } from "../themes/tokens.ts";
import { ScreenHeader } from "../components/ScreenHeader.tsx";
import {
  FabAction,
  FilterMenu,
  type ModelsSectionId,
} from "../components/ModelsPanels.tsx";
import { ReadyModels } from "../components/ReadyModels.tsx";
import { AvailableModels } from "../components/AvailableModels.tsx";
import { HFExplore } from "../components/HFExplore.tsx";
import { RemoteApiSection } from "../components/RemoteApiSection.tsx";
import { ModelSettingsModal } from "../components/ModelSettingsModal.tsx";
import { useModelStore } from "../store/modelStore";

export default function ModelsScreen() {
  const { loadPersisted, startDownload } = useModelStore();

  useEffect(() => {
    loadPersisted();
  }, []);

  const [menuOpen, setMenuOpen] = useState(false);
  const [visible, setVisible] = useState<Record<ModelsSectionId, boolean>>({
    ready: true,
    available: true,
    hf: true,
    remote: true,
  });
  const [fabOpen, setFabOpen] = useState(false);
  const [remoteModalOpen, setRemoteModalOpen] = useState(false);
  const [settingsModelId, setSettingsModelId] = useState<string | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const hfInputRef = useRef<TextInput>(null);
  const hfY = useRef(0);

  function toggleSection(id: ModelsSectionId): void {
    setVisible((prev) => ({ ...prev, [id]: !prev[id] }));
    // ponytail: never orphan the modal under a hidden section.
    if (id === "remote") setRemoteModalOpen(false);
  }

  function goToHfSearch(): void {
    setFabOpen(false);
    setVisible((prev) => ({ ...prev, hf: true }));
    // ponytail: layout settles first (hidden->shown refires onLayout),
    // then scroll to the fresh Y, then focus.
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, hfY.current - 8), animated: true });
    }, 100);
    setTimeout(() => hfInputRef.current?.focus(), 450);
  }

  function openRemoteModal(): void {
    setFabOpen(false);
    setVisible((prev) => ({ ...prev, remote: true }));
    setRemoteModalOpen(true);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.base }}>
      <ScreenHeader title="Models" />
      <View className="flex-1">
        <ScrollView
          ref={scrollRef}
          className="flex-1"
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 120 }}
        >
          <View className="flex-row items-center justify-between mb-4">
            <Text className="flex-1 font-sans text-body-md text-secondary-text">
              Download local models or configure remote API providers
            </Text>
            <Pressable
              onPress={() => setMenuOpen(!menuOpen)}
              className={`ml-2 p-2.5 rounded-lg border ${
                menuOpen ? "border-primary bg-primary/20" : "border-border"
              }`}
            >
              <SlidersHorizontal size={18} color={colors.primary} />
            </Pressable>
          </View>

          {menuOpen && <FilterMenu visible={visible} onToggle={toggleSection} />}

          {visible.ready && <ReadyModels onOpenSettings={setSettingsModelId} />}
          {visible.available && (
            <AvailableModels
              onDownload={(modelId, file) => startDownload(modelId, file)}
            />
          )}
          {visible.hf && (
            <HFExplore
              inputRef={hfInputRef}
              onLayoutY={(y) => {
                hfY.current = y;
              }}
            />
          )}
          {visible.remote && (
            <RemoteApiSection
              showModal={remoteModalOpen}
              setShowModal={setRemoteModalOpen}
            />
          )}
        </ScrollView>

        <View className="absolute right-4 bottom-8 items-end">
          {fabOpen && (
            <>
              <FabAction Icon={Search} label="Add from Hugging Face" onPress={goToHfSearch} />
              <FabAction Icon={Globe} label="Add remote provider" onPress={openRemoteModal} />
            </>
          )}
          <Pressable
            onPress={() => setFabOpen(!fabOpen)}
            className="w-14 h-14 rounded-full bg-primary items-center justify-center"
            style={{ elevation: 4 }}
          >
            {fabOpen ? (
              <X size={24} color={colors.base} />
            ) : (
              <Plus size={24} color={colors.base} />
            )}
          </Pressable>
        </View>
      </View>

      <ModelSettingsModal
        modelId={settingsModelId}
        onClose={() => setSettingsModelId(null)}
      />
    </SafeAreaView>
  );
}
