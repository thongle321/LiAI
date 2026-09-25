/** Ready-model rows: a downloaded local/HF/preset card and a remote-provider row. */

import { Pressable, Text, View } from "react-native";
import { Settings, Trash2 } from "lucide-react-native";

import { colors } from "../../themes/tokens.ts";
import { useModelStore } from "../../store/modelStore";
import type { ModelSpec, RemoteApiProvider } from "../../types/models";
import { formatParams } from "../../lib/model-providers.ts";
import { Chip, ModelTypeIcon, StatusBadge, StatusDot, formatBytes } from "./ModelBits.tsx";

function typeLabel(type: ModelSpec["type"]): string {
  if (type === "llm") return "LLM";
  if (type === "vision") return "Vision";
  return "Projection";
}

function ActiveBadge() {
  return (
    <View className="px-1.5 py-0.5 bg-green-500/20 border border-green-500/50 rounded">
      <Text className="font-sans text-xs text-green-500">Active</Text>
    </View>
  );
}

export function ModelCard({
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
  const { removeModel, getModelSettings } = useModelStore();
  const settings = getModelSettings(item.id);
  const title = settings.displayName || item.name;
  const params = item.params ?? 0;

  return (
    <View className="mb-3 bg-surface-1 border border-border rounded-xl overflow-hidden">
      <View className="p-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-1">
            <View className="flex-row items-center gap-2">
              <ModelTypeIcon type={item.type} />
              <Text className="font-sans-semibold text-body-md text-primary-text">{title}</Text>
            </View>
            <Text className="font-sans text-body-sm text-secondary-text/70 mt-0.5">
              by {item.author}
            </Text>
            <View className="flex-row flex-wrap items-center gap-2 mt-1.5">
              <Chip label={typeLabel(item.type)} />
              {params > 0 ? <Chip label={formatParams(params)} /> : null}
              <Chip label={formatBytes(item.files[0]?.size || 0)} />
              {item.files.length > 1 && <Chip label={`${item.files.length} files`} />}
              {isActive ? <ActiveBadge /> : <StatusBadge status="completed" />}
            </View>
          </View>
        </View>
        {isActive && (
          <Text className="font-sans text-caption text-secondary-text mt-1.5">
            Active on this device
          </Text>
        )}
        <View className="flex-row items-center gap-2 mt-3">
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
              onPress={() => removeModel(item.id)}
              className="px-3 py-1.5 bg-red-500/20 border border-red-500/50 rounded-lg"
            >
              <Trash2 size={16} color={colors.error} />
            </Pressable>
          </View>
      </View>
    </View>
  );
}

export function RemoteProviderCard({
  item,
  isActive,
  reachable,
  onActivate,
  onRemove,
}: {
  item: RemoteApiProvider;
  isActive: boolean;
  reachable: boolean | undefined;
  onActivate: () => void;
  onRemove: () => void;
}) {
  return (
    <View className="mb-3 bg-surface-1 border border-border rounded-xl overflow-hidden">
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
            {isActive && <ActiveBadge />}
            {!isActive && reachable === false && <Chip label="Unreachable" />}
          </View>
        </View>
        {!isActive && (
          <Pressable
            onPress={onActivate}
            className="px-3 py-1.5 bg-primary/20 border border-primary/50 rounded-lg"
          >
            <Text className="font-sans text-body-sm text-primary">Activate</Text>
          </Pressable>
        )}
        <Pressable
          onPress={onRemove}
          className="px-3 py-1.5 bg-red-500/20 border border-red-500/50 rounded-lg"
        >
          <Trash2 size={16} color={colors.error} />
        </Pressable>
      </View>
    </View>
  );
}
