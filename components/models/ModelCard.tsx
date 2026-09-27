/** Ready-model rows: a downloaded local/HF/preset card and a remote-provider row. */

import { Pressable, Text, View } from "react-native";
import { Power, Settings, Trash2 } from "lucide-react-native";

import { colors } from "../../themes/tokens.ts";
import { useModelStore } from "../../store/modelStore";
import type { ModelSpec, RemoteApiProvider } from "../../types/models";
import { Chip, ModelTypeIcon, StatusDot, formatBytes } from "./ModelBits.tsx";

function typeLabel(type: ModelSpec["type"]): string {
  if (type === "llm") return "LLM";
  if (type === "vision") return "Vision";
  return "Projection";
}

export function ModelCard({
  item,
  isActive,
  onActivate,
  onDeactivate,
  onSettings,
}: {
  item: ModelSpec;
  isActive: boolean;
  /** Load: point the engine at this model. */
  onActivate: () => void;
  /** Unload: free the engine so no model is active. */
  onDeactivate: () => void;
  onSettings: () => void;
}) {
  const { removeModel, getModelSettings } = useModelStore();
  const settings = getModelSettings(item.id);
  const title = settings.displayName || item.name;
  // Only the file size, never the parameter count next to it: "0.6B" beside
  // "751 MB" reads as two competing sizes for one model.
  const fileBytes = item.files.reduce((sum, f) => sum + f.size, 0);

  return (
    <View className="mb-3 overflow-hidden rounded-lg border border-border bg-surface-1">
      <View className="p-5">
        <View className="flex-row items-center gap-2">
          <ModelTypeIcon type={item.type} />
          {/* flex-1/shrink so a long name truncates instead of pushing the
              green dot past the card edge. middle-ellipsis keeps the
              informative end of an "org/model" repo name (pocketpal's
              ModelCard uses flex:1/minWidth:0 + numberOfLines +
              ellipsizeMode="middle"). */}
          <Text
            numberOfLines={1}
            ellipsizeMode="middle"
            className="shrink font-sans-semibold text-body-md text-primary-text"
          >
            {title}
          </Text>
          {/* Loaded reads as a green dot alone — no "Active" word, no tint
              chip. The paired "Unload" button below is the word that keeps
              this from being a colour-only signal; the label keeps it
              reachable to a screen reader. */}
          {isActive && (
            <View
              accessibilityRole="text"
              accessibilityLabel="Loaded"
            >
              <StatusDot color={colors.success} />
            </View>
          )}
        </View>
        <Text className="mt-1 font-sans text-body-sm text-secondary-text/70">
          by {item.author}
        </Text>
        <View className="mt-2 flex-row flex-wrap items-center gap-2">
          <Chip label={typeLabel(item.type)} />
          {fileBytes > 0 && <Chip label={formatBytes(fileBytes)} />}
          {item.files.length > 1 && <Chip label={`${item.files.length} files`} />}
        </View>
        {/* Wraps so a long model name + three actions reflow instead of
            clipping at 320pt. */}
        <View className="mt-3 flex-row flex-wrap items-center gap-2">
          <Pressable
            onPress={isActive ? onDeactivate : onActivate}
            className={`btn min-h-12 px-5 py-2 ${isActive ? "btn--secondary" : "btn--primary"}`}
            accessibilityRole="button"
            accessibilityLabel={
              isActive ? `Unload ${title}` : `Load ${title}`
            }
          >
            <Power size={16} color={isActive ? colors.primary : colors.onPrimary} />
            <Text
              className={`ml-2 font-sans text-body-sm ${
                isActive ? "text-primary" : "text-on-primary"
              }`}
            >
              {isActive ? "Unload" : "Load"}
            </Text>
          </Pressable>
          <Pressable
            onPress={onSettings}
            className="h-12 w-12 items-center justify-center rounded-full"
            accessibilityRole="button"
            accessibilityLabel={`Settings for ${title}`}
          >
            <View className="h-10 w-10 items-center justify-center rounded-full border border-border bg-surface-1">
              <Settings size={16} color={colors.secondaryText} />
            </View>
          </Pressable>
          <Pressable
            onPress={() => removeModel(item.id)}
            className="h-12 w-12 items-center justify-center rounded-full"
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
          <View className="flex-row items-center gap-2 mt-2">
            <Chip label={item.providerType === "openrouter" ? "OpenRouter" : "Remote API"} />
            {!isActive && reachable === false && <Chip label="Unreachable" />}
          </View>
        </View>
        {!isActive && (
          <Pressable
            onPress={onActivate}
            className="btn btn--primary min-h-12 px-5 py-2"
            accessibilityRole="button"
            accessibilityLabel={`Activate ${item.name}`}
          >
            <Text className="font-sans text-body-sm text-on-primary">Activate</Text>
          </Pressable>
        )}
        <Pressable
          onPress={onRemove}
          className="h-12 w-12 items-center justify-center rounded-full"
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
