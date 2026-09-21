/** "Ready to use" group: completed local downloads + connected remote APIs.
 *
 * One list of everything chat-ready. Management (add/remove providers,
 * delete files) stays in the section components below.
 */

import { Pressable, Text, View } from "react-native";
import { Settings, Trash2, Upload } from "lucide-react-native";

import { colors } from "../themes/tokens.ts";
import { useModelStore } from "../store/modelStore";
import type { ModelSpec } from "../types/models";
import { Chip, ModelGroup, StatusBadge, StatusDot, formatBytes } from "./ModelBits.tsx";
import { formatParams, isProviderActive } from "../lib/model-providers.ts";

function typeLabel(type: ModelSpec["type"]): string {
  if (type === "llm") return "LLM";
  if (type === "vision") return "Vision";
  return "Projection";
}

function DownloadedCard({
  item,
  isActive,
  onActivate,
  onSettings,
}: {
  item: ModelSpec;
  isActive: boolean;
  onActivate: () => void;
  onSettings: () => void;
}) {
  const { removeModel, uploadToBackend, getModelSettings } = useModelStore();
  const settings = getModelSettings(item.id);
  const title = settings.displayName || item.name;
  const params = item.params ?? 0;

  return (
    <View className="mb-3 bg-surface-1 border border-border rounded-xl overflow-hidden">
      <View className="p-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-1">
            <Text className="font-sans-semibold text-body-md text-primary-text">{title}</Text>
            <Text className="font-sans text-body-sm text-secondary-text/70 mt-0.5">
              by {item.author}
            </Text>
            <View className="flex-row items-center gap-2 mt-1.5">
              <Chip label={typeLabel(item.type)} />
              {params > 0 ? <Chip label={formatParams(params)} /> : null}
              <Chip label={formatBytes(item.files[0]?.size || 0)} />
              {item.files.length > 1 && <Chip label={`${item.files.length} files`} />}
              {isActive ? (
                <View className="px-1.5 py-0.5 bg-green-500/20 border border-green-500/50 rounded">
                  <Text className="font-sans text-xs text-green-500">Active</Text>
                </View>
              ) : (
                <StatusBadge status="completed" />
              )}
            </View>
          </View>
          <View className="flex-row items-center gap-2">
            {!isActive && (
              <Pressable
                onPress={onActivate}
                className="px-3 py-1.5 bg-primary/20 border border-primary/50 rounded-lg"
              >
                <Text className="font-sans text-body-sm text-primary">Activate</Text>
              </Pressable>
            )}
            <Pressable
              onPress={onSettings}
              className="px-3 py-1.5 bg-surface-2 border border-border rounded-lg"
            >
              <Settings size={16} color={colors.primary} />
            </Pressable>
            <Pressable
              onPress={() => uploadToBackend(item.id)}
              className="px-3 py-1.5 bg-blue-500/20 border border-blue-500/50 rounded-lg"
            >
              <Upload size={16} color={colors.info} />
            </Pressable>
            <Pressable
              onPress={() => removeModel(item.id)}
              className="px-3 py-1.5 bg-red-500/20 border border-red-500/50 rounded-lg"
            >
              <Trash2 size={16} color={colors.error} />
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

export function ReadyModels({
  open,
  onToggle,
  onOpenSettings,
}: {
  open: boolean;
  onToggle: () => void;
  onOpenSettings: (modelId: string) => void;
}) {
  const {
    models,
    remoteApis,
    remoteCaps,
    activeModelId,
    setActiveModel,
    setActiveRemoteApi,
    removeRemoteApi,
  } = useModelStore();

  const downloaded = models.filter(
    (m) => m.origin !== "remote_api" && m.downloadStatus === "completed",
  );

  return (
    <ModelGroup
      title="Ready to use"
      count={downloaded.length + remoteApis.length}
      open={open}
      onToggle={onToggle}
    >
      {downloaded.map((item) => (
        <DownloadedCard
          key={item.id}
          item={item}
          isActive={activeModelId === item.id}
          onActivate={() => setActiveModel(item.id, "local")}
          onSettings={() => onOpenSettings(item.id)}
        />
      ))}

      {remoteApis.map((item) => {
        const isActive = isProviderActive(activeModelId, item.id);
        return (
          <View key={item.id} className="mb-3 bg-surface-1 border border-border rounded-xl overflow-hidden">
            <View className="p-4 flex-row items-center justify-between">
              <View className="flex-1">
                <View className="flex-row items-center gap-2">
                  <StatusDot color={isActive ? colors.success : colors.secondaryText} />
                  <Text className="font-sans-semibold text-body-md text-primary-text">{item.name}</Text>
                </View>
                <Text className="font-sans text-body-sm text-secondary-text/70 mt-0.5">
                  {item.baseUrl} • {item.modelName}
                </Text>
                <View className="flex-row items-center gap-2 mt-1.5">
                  <Chip label={item.providerType === "openrouter" ? "OpenRouter" : "Remote API"} />
                  {isActive && (
                    <View className="px-1.5 py-0.5 bg-green-500/20 border border-green-500/50 rounded">
                      <Text className="font-sans text-xs text-green-500">Active</Text>
                    </View>
                  )}
                  {!isActive && remoteCaps[item.id]?.reachable === false && (
                    <Chip label="Unreachable" />
                  )}
                </View>
              </View>
              {!isActive && (
                <Pressable
                  onPress={() => setActiveRemoteApi(item.id)}
                  className="px-3 py-1.5 bg-primary/20 border border-primary/50 rounded-lg"
                >
                  <Text className="font-sans text-body-sm text-primary">Activate</Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => removeRemoteApi(item.id)}
                className="px-3 py-1.5 bg-red-500/20 border border-red-500/50 rounded-lg"
              >
                <Trash2 size={16} color={colors.error} />
              </Pressable>
            </View>
          </View>
        );
      })}
    </ModelGroup>
  );
}
