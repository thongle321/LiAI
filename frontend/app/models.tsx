/** Models screen: Ready to use + Available to download, header filters, 3-action FAB. */

import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Cloud,
  FolderPlus,
  Plus,
  Search,
  X,
} from "lucide-react-native";

import { colors, spacing } from "../themes/tokens.ts";
import { ScreenHeader } from "../components/ScreenHeader.tsx";
import { ModelsHeaderMenu } from "../components/ModelsHeaderMenu.tsx";
import { FabAction } from "../components/ModelsPanels.tsx";
import { ReadyModels } from "../components/ReadyModels.tsx";
import { AvailableModels } from "../components/AvailableModels.tsx";
import { HFExplore } from "../components/HFExplore.tsx";
import { RemoteApiModal } from "../components/RemoteApiModal.tsx";
import { ModelSettingsModal } from "../components/ModelSettingsModal.tsx";
import { useLocalModelImport } from "../hooks/useLocalModelImport.ts";
import { useModelStore } from "../store/modelStore";

export default function ModelsScreen() {
  const { loadPersisted, startDownload } = useModelStore();
  const importLocalModel = useLocalModelImport();

  useEffect(() => {
    loadPersisted();
  }, []);

  const [visible, setVisible] = useState({ ready: true, available: true });
  const [groupsOpen, setGroupsOpen] = useState({ ready: true, available: true });
  const [fabOpen, setFabOpen] = useState(false);
  const [hfOpen, setHfOpen] = useState(false);
  const [remoteModalOpen, setRemoteModalOpen] = useState(false);
  const [settingsModelId, setSettingsModelId] = useState<string | null>(null);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.base }}>
      <ScreenHeader
        title="Models"
        right={
          <ModelsHeaderMenu
            readyVisible={visible.ready}
            availableVisible={visible.available}
            onToggleReady={() => setVisible((p) => ({ ...p, ready: !p.ready }))}
            onToggleAvailable={() => setVisible((p) => ({ ...p, available: !p.available }))}
            onExpandAll={() => setGroupsOpen({ ready: true, available: true })}
            onCollapseAll={() => setGroupsOpen({ ready: false, available: false })}
          />
        }
      />
      <View className="flex-1">
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 120 }}
        >
          {visible.ready && (
            <ReadyModels
              open={groupsOpen.ready}
              onToggle={() => setGroupsOpen((p) => ({ ...p, ready: !p.ready }))}
              onOpenSettings={setSettingsModelId}
            />
          )}
          {visible.available && (
            <AvailableModels
              open={groupsOpen.available}
              onToggle={() => setGroupsOpen((p) => ({ ...p, available: !p.available }))}
              onDownload={(modelId, file) => startDownload(modelId, file)}
            />
          )}
        </ScrollView>

        <View className="absolute right-4 bottom-8 items-end">
          {fabOpen && (
            <>
              <FabAction Icon={Search} label="Add from Hugging Face" onPress={() => { setFabOpen(false); setHfOpen(true); }} />
              <FabAction Icon={FolderPlus} label="Add local model" onPress={() => { setFabOpen(false); void importLocalModel(); }} />
              <FabAction Icon={Cloud} label="Add from API" onPress={() => { setFabOpen(false); setRemoteModalOpen(true); }} />
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

      <Modal visible={hfOpen} animationType="slide" onRequestClose={() => setHfOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.base }}>
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ padding: spacing.md }}
            keyboardShouldPersistTaps="handled"
          >
            <HFExplore onClose={() => setHfOpen(false)} />
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <RemoteApiModal showModal={remoteModalOpen} setShowModal={setRemoteModalOpen} />

      <ModelSettingsModal
        modelId={settingsModelId}
        onClose={() => setSettingsModelId(null)}
      />
    </SafeAreaView>
  );
}
