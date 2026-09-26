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
    <View className="flex-row items-center gap-1 rounded bg-success/10 px-2 py-0.5">
      <View className="h-2 w-2 rounded-full bg-success" />
      <Text className="font-sans text-caption text-secondary-text">Active</Text>
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
    <View className="mb-3 bg-surface-1 border border-border rounded-lg overflow-hidden">
    <View className="p-5">
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
        <View className="mt-3 flex-row items-center gap-2">
            {!isActive && (
              <Pressable
                onPress={onActivate}
                className="btn btn--primary min-h-11 px-5 py-2"
                accessibilityRole="button"
                accessibilityLabel={`Activate ${title}`}
              >
                <Text className="font-sans text-body-sm text-on-primary">Activate</Text>
              </Pressable>
            )}
            <Pressable
              onPress={onSettings}
              className="h-11 w-11 items-center justify-center rounded-full border border-border bg-surface-1"
              accessibilityRole="button"
              accessibilityLabel={`Settings for ${title}`}
            >
              <Settings size={16} color={colors.secondaryText} />
            </Pressable>
            {/* Destructive: Alert Tint fill, Alert Red icon, 40px circle. */}
            <Pressable
              onPress={() => removeModel(item.id)}
              className="h-11 w-11 items-center justify-center rounded-full"
              accessibilityRole="button"
              accessibilityLabel={`Delete ${title}`}
            >
              <View className="h-10 w-10 items-center justify-center rounded-full bg-error/10">
                <Trash2 size={16} color={colors.error} />
              </View>
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
    <View className="mb-3 bg-surface-1 border border-border rounded-lg overflow-hidden">
    <View className="p-5 flex-row items-center justify-between">
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
            className="btn btn--primary min-h-11 px-5 py-2"
            accessibilityRole="button"
            accessibilityLabel={`Activate ${item.name}`}
          >
            <Text className="font-sans text-body-sm text-on-primary">Activate</Text>
          </Pressable>
        )}
        <Pressable
          onPress={onRemove}
          className="h-11 w-11 items-center justify-center rounded-full"
          accessibilityRole="button"
          accessibilityLabel={`Remove ${item.name}`}
        >
          <View className="h-10 w-10 items-center justify-center rounded-full bg-error/10">
            <Trash2 size={16} color={colors.error} />
          </View>
        </Pressable>
      </View>
    </View>
  );
}
