/** Upgraded Hugging Face search: debounced query, stats rows, rich file cards.
 *
 * Shown in the full-screen Add-from-HF modal. First page only; pagination deferred.
 */

import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { ChevronDown, Lock, X } from "lucide-react-native";

import { colors } from "../themes/tokens.ts";
import { useModelStore } from "../store/modelStore";
import type { HFModelFile } from "../types/models";
import {
  Chip,
  DownloadButton,
  StatusBadge,
  formatBytes,
  formatCompact,
} from "./ModelBits.tsx";

export function HFExplore({
  onClose,
}: {
  onClose?: () => void;
}) {
  const { searchModels, searchResults, searchLoading, searchError, getModelFiles, startDownload, hfToken, setHfToken } = useModelStore();
  const [query, setQuery] = useState("");
  const [expandedModel, setExpandedModel] = useState<string | null>(null);
  const [modelFiles, setModelFiles] = useState<Record<string, HFModelFile[]>>({});
  const [loadingFiles, setLoadingFiles] = useState<Set<string>>(new Set());

  // ponytail: debounce so we search once per pause, not per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      searchModels(query.length >= 2 ? query : "");
    }, 500);
    return () => clearTimeout(t);
  }, [query]);

  const handleModelPress = async (modelId: string) => {
    if (expandedModel === modelId) {
      setExpandedModel(null);
      return;
    }

    setExpandedModel(modelId);
    if (!modelFiles[modelId]) {
      setLoadingFiles((prev) => new Set(prev).add(modelId));
      try {
        const files = await getModelFiles(modelId);
        setModelFiles((prev) => ({ ...prev, [modelId]: files }));
      } catch (e) {
        console.error("Failed to load model files:", e);
      } finally {
        setLoadingFiles((prev) => {
          const next = new Set(prev);
          next.delete(modelId);
          return next;
        });
      }
    }
  };

  return (
    <View className="mb-6">
      <View className="flex-row items-center justify-between mb-3">
        <Text className="font-sans-semibold text-h4 text-primary-text">Search Hugging Face</Text>
        {onClose && (
          <Pressable onPress={onClose} className="p-1">
            <X size={22} color={colors.secondaryText} />
          </Pressable>
        )}
      </View>

      <View className="flex-row items-center gap-2 mb-3">
        <TextInput
          placeholder="Search models (e.g., llama, qwen, gemma)..."
          value={query}
          onChangeText={setQuery}
          autoFocus={onClose !== undefined}
          className="flex-1 font-sans text-body-md text-primary-text bg-surface-1 border border-border rounded-lg px-4 py-3"
          placeholderTextColor={colors.secondaryText}
        />
        {hfToken ? null : (
          <Pressable onPress={() => setHfToken("user_token_placeholder")} className="px-3 py-3 bg-primary/20 border border-primary/50 rounded-lg">
            <Text className="font-sans text-body-sm text-primary">Add HF Token</Text>
          </Pressable>
        )}
      </View>

      {searchError && (
        <Text className="font-sans text-body-sm text-red-500 mb-3">Error: {searchError}</Text>
      )}

      {searchLoading && (
        <View className="flex-row items-center justify-center py-4">
          <ActivityIndicator size="small" color={colors.primary} />
          <Text className="ml-2 font-sans text-body-md text-secondary-text">Searching...</Text>
        </View>
      )}

      {searchResults.map((item) => (
        <Pressable
          key={item.modelId}
          onPress={() => handleModelPress(item.modelId)}
          className="mb-3 bg-surface-1 border border-border rounded-xl overflow-hidden"
        >
          <View className="p-4">
            <View className="flex-row items-center justify-between">
              <View className="flex-1">
                <Text className="font-sans-semibold text-body-md text-primary-text">{item.name}</Text>
                <Text className="font-sans text-body-sm text-secondary-text/70 mt-0.5">by {item.author}</Text>
              </View>
              <ChevronDown size={20} color={colors.secondaryText} />
            </View>
            <View className="flex-row items-center gap-2 mt-2.5">
              <Chip label="GGUF" />
              {item.private && (
                <View className="flex-row items-center gap-1 px-1.5 py-0.5 bg-surface-2 border border-border rounded">
                  <Lock size={10} color={colors.secondaryText} />
                  <Text className="font-sans text-xs text-secondary-text">Gated</Text>
                </View>
              )}
              <Text className="font-sans text-body-sm text-secondary-text/70">
                {formatCompact(item.downloads)} downloads • {formatCompact(item.likes)} likes
              </Text>
              <StatusBadge status="idle" />
            </View>
          </View>

          {expandedModel === item.modelId && (
            <View className="border-t border-border px-4 pb-4">
              {loadingFiles.has(item.modelId) ? (
                <View className="flex-row items-center justify-center py-4">
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text className="ml-2 font-sans text-body-md text-secondary-text">Loading files...</Text>
                </View>
              ) : (
                <View>
                  <View className="mb-3">
                    <Text className="font-sans-semibold text-body-sm text-secondary-text mb-2">GGUF Files</Text>
                  </View>
                  {(modelFiles[item.modelId] || []).map((file) => (
                    <View key={file.name} className="py-3 border-b border-border/50">
                      <View className="flex-row items-center justify-between">
                        <View className="flex-1">
                          <Text className="font-sans text-body-md text-primary-text">{file.name}</Text>
                          <View className="flex-row items-center gap-2 mt-1.5">
                            <Chip label="GGUF" />
                            <Text className="font-sans text-body-sm text-secondary-text/70">{formatBytes(file.size)}</Text>
                          </View>
                        </View>
                        <DownloadButton
                          modelId={item.modelId}
                          file={file}
                          status="idle"
                          progress={0}
                          onPress={() => startDownload(item.modelId, file, hfToken || undefined)}
                        />
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
        </Pressable>
      ))}
      {query.length >= 2 && !searchLoading && searchResults.length === 0 && (
        <Text className="text-center font-sans text-body-md text-secondary-text py-4">
          No models found. Try a different search term.
        </Text>
      )}
    </View>
  );
}
