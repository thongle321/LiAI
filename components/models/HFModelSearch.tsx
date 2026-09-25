/** Hugging Face search: debounced query, stats rows, rich file cards.
 *
 * Shown in the full-screen Add-from-HF modal. First page only; pagination
 * deferred.
 */

import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, Text, TextInput, View } from "react-native";
import { Check, ChevronDown, Lock, X } from "lucide-react-native";

import { colors } from "../../themes/tokens.ts";
import { useLoadGuard } from "../../hooks/useLoadGuard.ts";
import { useModelStore } from "../../store/modelStore";
import { hfSpecId } from "../../lib/models/huggingface.ts";
import type { HFModelFile } from "../../types/models";
import {
  Chip,
  DownloadButton,
  DownloadProgressBar,
  ModelTypeIcon,
  StatusBadge,
  formatBytes,
  formatCompact,
  isProgressVisible,
} from "./ModelBits.tsx";

/** Vision signal without opening the repo (PocketPal DetailsView parity):
 * a projector file among the GGUF siblings means a vision model. */
function isVisionSearchResult(files: HFModelFile[]): boolean {
  return files.some((f) => f.name.toLowerCase().includes("mmproj"));
}

export function HFModelSearch({ onClose }: { onClose?: () => void }) {
  const {
    searchModels,
    searchResults,
    searchLoading,
    searchError,
    getModelFiles,
    startDownload,
    pauseModelDownload,
    resumeModelDownload,
    hfToken,
    setHfToken,
    models,
  } = useModelStore();
  const guard = useLoadGuard();
  const [query, setQuery] = useState("");
  const [expandedModel, setExpandedModel] = useState<string | null>(null);
  const [modelFiles, setModelFiles] = useState<Record<string, HFModelFile[]>>({});
  const [loadingFiles, setLoadingFiles] = useState<Set<string>>(new Set());
  const [tokenOpen, setTokenOpen] = useState(false);
  const [draft, setDraft] = useState("");

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
        <Pressable
          onPress={() => {
            setDraft("");
            setTokenOpen(true);
          }}
          className="flex-row items-center gap-1.5 px-3 py-3 bg-primary/20 border border-primary/50 rounded-lg"
        >
          {hfToken ? <Check size={14} color={colors.primary} /> : null}
          <Text className="font-sans text-body-sm text-primary">
            {hfToken ? "HF Token" : "Add HF Token"}
          </Text>
        </Pressable>
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
                <View className="flex-row items-center gap-2">
                  <ModelTypeIcon
                    type={isVisionSearchResult(item.ggufFiles) ? "vision" : "llm"}
                  />
                  <Text className="font-sans-semibold text-body-md text-primary-text">{item.name}</Text>
                </View>
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
                  {(modelFiles[item.modelId] || []).map((file) => {
                    // Store spec id mirrors buildHfModelSpec.
                    const spec = models.find((m) => m.id === hfSpecId(item.modelId, file.name));
                    const st = spec?.downloadStatus ?? "idle";
                    const prog = spec?.downloadProgress ?? 0;
                    return (
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
                          status={st}
                          progress={prog}
                          onPress={() =>
                            guard(file.size, () =>
                              startDownload(item.modelId, file, hfToken || undefined),
                            )
                          }
                          onPause={() => void pauseModelDownload(hfSpecId(item.modelId, file.name))}
                          onResume={() => void resumeModelDownload(hfSpecId(item.modelId, file.name))}
                          disabled={st === "completed"}
                        />
                      </View>
                      {isProgressVisible(st) && (
                        <DownloadProgressBar
                          progress={prog}
                          speed={spec?.speedBytesPerSec}
                        />
                      )}
                    </View>
                    );
                  })}
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
      <Modal
        visible={tokenOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setTokenOpen(false)}
      >
        <View className="flex-1 bg-black/60 items-center justify-center p-4">
          <View className="bg-surface-1 border border-border rounded-2xl w-full p-6">
            <Text className="font-sans-semibold text-h4 text-primary-text mb-2">
              Hugging Face token
            </Text>
            <Text className="font-sans text-body-sm text-secondary-text mb-4">
              Needed only for gated repos. Stored on this device, sent per request.
            </Text>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="hf_..."
              secureTextEntry
              autoFocus
              className="font-sans text-body-md text-primary-text bg-surface-2 border border-border rounded-lg px-4 py-3"
              placeholderTextColor={colors.secondaryText}
            />
            <View className="flex-row gap-2 pt-4">
              {hfToken ? (
                <Pressable
                  onPress={() => {
                    void setHfToken(null);
                    setTokenOpen(false);
                  }}
                  className="flex-1 py-3 px-4 bg-surface-2 border border-border rounded-lg items-center"
                >
                  <Text className="font-sans text-body-md text-secondary-text">Remove</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => setTokenOpen(false)}
                className="flex-1 py-3 px-4 bg-surface-2 border border-border rounded-lg items-center"
              >
                <Text className="font-sans text-body-md text-secondary-text">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (draft.trim() === "") return;
                  void setHfToken(draft.trim());
                  setTokenOpen(false);
                }}
                className="flex-1 py-3 px-4 bg-primary border border-primary/50 rounded-lg items-center"
              >
                <Text className="font-sans-semibold text-body-md text-base">Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
