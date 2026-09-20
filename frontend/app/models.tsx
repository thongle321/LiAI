/** Models management screen: download GGUF models, manage remote APIs. */

import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ChevronDown,
  ChevronUp,
  Download,
  Pause,
  Play,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react-native";

import { colors, spacing } from "../themes/tokens.ts";
import { useModelStore } from "../store/modelStore";
import type { PresetModel, PresetModelFile, HFModelFile, RemoteApiProvider, ModelDownloadStatus } from "../types/models";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function formatProgress(downloaded: number, total: number): string {
  return `${formatBytes(downloaded)} / ${formatBytes(total)}`;
}

const STATUS_DOT_COLOR: Record<ModelDownloadStatus, string> = {
  completed: colors.success,
  downloading: colors.primary,
  paused: colors.warning,
  failed: colors.error,
  cancelled: colors.secondaryText,
  idle: colors.secondaryText,
};

const STATUS_LABEL: Record<ModelDownloadStatus, string> = {
  completed: "Downloaded",
  downloading: "Downloading",
  paused: "Paused",
  failed: "Failed",
  cancelled: "Cancelled",
  idle: "Not downloaded",
};

function isProgressVisible(status: ModelDownloadStatus): boolean {
  return status === "downloading" || status === "paused";
}

function StatusBadge({ status }: { status: ModelDownloadStatus }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <View
        className="w-2 h-2 rounded-full"
        style={{ backgroundColor: STATUS_DOT_COLOR[status] }}
      />
      <Text className="font-sans text-body-sm text-secondary-text">
        {STATUS_LABEL[status]}
      </Text>
    </View>
  );
}

function DownloadProgressBar({
  progress,
  downloaded,
  total,
}: {
  progress: number;
  downloaded: number;
  total: number;
}) {
  return (
    <View className="mt-2">
      <View className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
        <View
          className="h-full bg-primary rounded-full"
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </View>
      <Text className="font-sans text-body-sm text-secondary-text/70 mt-1">
        {formatProgress(downloaded, total)} ({Math.round(progress)}%)
      </Text>
    </View>
  );
}

function DownloadButton({
  modelId,
  file,
  status,
  progress,
  onPress,
  disabled = false,
}: {
  modelId: string;
  file: PresetModelFile | HFModelFile;
  status: string;
  progress: number;
  onPress: () => void;
  disabled?: boolean;
}) {
  const isDownloading = status === "downloading";
  const isPaused = status === "paused";
  const isCompleted = status === "completed";

  if (isCompleted) {
    return (
      <Pressable onPress={onPress} className="flex-row items-center px-3 py-2 bg-green-500/20 border border-green-500/50 rounded-lg">
        <Download size={16} color={colors.primary} />
        <Text className="ml-2 font-sans text-body-sm text-green-500">Downloaded</Text>
      </Pressable>
    );
  }

  return (
    <Pressable onPress={onPress} disabled={disabled} className="flex-row items-center px-3 py-2 bg-surface-2 border border-border rounded-lg">
      {isDownloading ? (
        <Pause size={16} color={colors.primary} />
      ) : isPaused ? (
        <Play size={16} color={colors.primary} />
      ) : (
        <Download size={16} color={colors.primary} />
      )}
      <Text className="ml-2 font-sans text-body-sm text-primary-text">
        {isDownloading
          ? `${Math.round(progress)}%`
          : isPaused
          ? "Paused"
          : "Download"}
      </Text>
    </Pressable>
  );
}

function PresetModelCard({
  preset,
  onDownload,
}: {
  preset: PresetModel;
  onDownload: (modelId: string, file: PresetModelFile) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { models } = useModelStore();

  const existingModel = models.find(
    (m) => m.origin === "preset" && m.id.startsWith(`preset-${preset.id}-`),
  );

  const getStatus = (file: PresetModelFile) => {
    if (!existingModel) return "idle";
    return existingModel.downloadStatus;
  };

  const getProgress = (file: PresetModelFile) => {
    if (!existingModel) return 0;
    return existingModel.downloadProgress;
  };

  const cardStatus = existingModel ? existingModel.downloadStatus : "idle";
  const showCardProgress =
    existingModel !== undefined && isProgressVisible(cardStatus);

  return (
    <View className="mb-4 bg-surface-1 border border-border rounded-xl overflow-hidden">
      <Pressable onPress={() => setExpanded(!expanded)} className="p-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-1">
            <View className="flex-row items-center gap-2 mb-1">
              <Text className="font-sans-semibold text-h4 text-primary-text">{preset.name}</Text>
              {preset.recommended && (
                <View className="px-1.5 py-0.5 bg-primary/20 border border-primary/50 rounded">
                  <Text className="font-sans text-xs text-primary">Recommended</Text>
                </View>
              )}
            </View>
            <Text className="font-sans text-body-sm text-secondary-text mb-1">{preset.description}</Text>
            <Text className="font-sans text-body-sm text-secondary-text/70">by {preset.author}</Text>
          </View>
          {expanded ? <ChevronUp size={20} color={colors.secondaryText} /> : <ChevronDown size={20} color={colors.secondaryText} />}
        </View>

        <View className="flex-row items-center justify-between mt-3">
          <StatusBadge status={cardStatus} />
          <View className="px-1.5 py-0.5 bg-surface-2 border border-border rounded">
            <Text className="font-sans text-xs text-secondary-text">
              {preset.files.length} file{preset.files.length === 1 ? "" : "s"}
            </Text>
          </View>
        </View>

        {showCardProgress && (
          <DownloadProgressBar
            progress={existingModel.downloadProgress}
            downloaded={existingModel.downloadedBytes}
            total={existingModel.totalBytes}
          />
        )}
      </Pressable>

      {expanded && (
        <View className="border-t border-border px-4 pb-4">
          <View className="mb-3">
            <Text className="font-sans-semibold text-body-sm text-secondary-text mb-2">Available Quantizations</Text>
          </View>
          {preset.files.map((item) => {
            const st = getStatus(item);
            return (
            <View key={item.name} className="py-3 border-b border-border/50">
              <View className="flex-row items-center justify-between">
                <View className="flex-1">
                  <Text className="font-sans text-body-md text-primary-text">{item.name}</Text>
                  <View className="flex-row items-center gap-2 mt-1.5">
                    <View className="px-1.5 py-0.5 bg-surface-2 border border-border rounded">
                      <Text className="font-sans text-xs text-secondary-text">{item.quantization}</Text>
                    </View>
                    <Text className="font-sans text-body-sm text-secondary-text/70">{formatBytes(item.size)}</Text>
                  </View>
                </View>
                <DownloadButton
                  modelId={preset.id}
                  file={item}
                  status={st}
                  progress={getProgress(item)}
                  onPress={() => onDownload(preset.id, item)}
                  disabled={st === "downloading"}
                />
              </View>
              {isProgressVisible(st) && existingModel && (
                <DownloadProgressBar
                  progress={existingModel.downloadProgress}
                  downloaded={existingModel.downloadedBytes}
                  total={existingModel.totalBytes}
                />
              )}
            </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function HFSearchSection() {
  const { searchModels, searchResults, searchLoading, searchError, getModelFiles, startDownload, hfToken, setHfToken } = useModelStore();
  const [query, setQuery] = useState("");
  const [expandedModel, setExpandedModel] = useState<string | null>(null);
  const [modelFiles, setModelFiles] = useState<Record<string, HFModelFile[]>>({});
  const [loadingFiles, setLoadingFiles] = useState<Set<string>>(new Set());

  const handleSearch = (text: string) => {
    setQuery(text);
    if (text.length >= 2) {
      searchModels(text);
    } else {
      searchModels("");
    }
  };

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
      <Text className="font-sans-semibold text-h4 text-primary-text mb-3">Search Hugging Face</Text>

      <View className="flex-row items-center gap-2 mb-3">
        <TextInput
          placeholder="Search models (e.g., llama, qwen, gemma)..."
          value={query}
          onChangeText={handleSearch}
          className="flex-1 font-sans text-body-md text-primary-text bg-surface-1 border border-border rounded-lg px-4 py-3"
          placeholderTextColor={colors.secondaryText}
        />
        {hfToken ? null : (
          <Pressable onPress={() => setHfToken("user_token_placeholder")} className="px-3 py-3 bg-primary/20 border border-primary/50 rounded-lg">
            <Text className="font-sans text-body-sm text-primary">Add HF Token</Text>
          </Pressable>
        )}
      </View>

      {hfToken && (
        <Text className="font-sans text-body-sm text-green-500 mb-3">HF Token configured ✓</Text>
      )}

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
              <View className="px-1.5 py-0.5 bg-surface-2 border border-border rounded">
                <Text className="font-sans text-xs text-secondary-text">GGUF</Text>
              </View>
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
                            <View className="px-1.5 py-0.5 bg-surface-2 border border-border rounded">
                              <Text className="font-sans text-xs text-secondary-text">GGUF</Text>
                            </View>
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

function RemoteApiSection() {
  const { remoteApis, addRemoteApi, removeRemoteApi, validateRemoteApi, setActiveRemoteApi, activeModelId } = useModelStore();
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [modelName, setModelName] = useState("");
  const [providerType, setProviderType] = useState<"custom_openai" | "openrouter">("custom_openai");
  const [validating, setValidating] = useState(false);

  const handleSubmit = async () => {
    if (!name || !baseUrl || !modelName) {
      Alert.alert("Error", "Please fill in all required fields");
      return;
    }

    setValidating(true);
    const provider: RemoteApiProvider = {
      id: `api-${Date.now()}`,
      name,
      providerType,
      baseUrl,
      apiKey: apiKey || "not-required",
      modelName,
      isActive: false,
    };

    const isValid = await validateRemoteApi(provider);
    if (!isValid) {
      Alert.alert("Warning", "Could not validate API endpoint. Adding anyway.");
    }

    addRemoteApi(provider);
    setShowModal(false);
    setName("");
    setBaseUrl("");
    setApiKey("");
    setModelName("");
    setValidating(false);
  };

  return (
    <View className="mb-6">
      <View className="flex-row items-center justify-between mb-3">
        <Text className="font-sans-semibold text-h4 text-primary-text">Remote API Providers</Text>
        <Pressable onPress={() => setShowModal(true)} className="flex-row items-center gap-1 px-3 py-2 bg-primary/20 border border-primary/50 rounded-lg">
          <Plus size={16} color={colors.primary} />
          <Text className="font-sans text-body-sm text-primary">Add</Text>
        </Pressable>
      </View>

      {remoteApis.length === 0 ? (
        <View className="bg-surface-1 border border-border rounded-xl p-8 items-center">
          <Text className="font-sans text-body-md text-secondary-text text-center mb-2">
            No remote API providers configured
          </Text>
          <Text className="font-sans text-body-sm text-secondary-text/70 text-center">
            Add OpenRouter, Ollama, vLLM, or any OpenAI-compatible endpoint
          </Text>
        </View>
      ) : (
        <View>
          {remoteApis.map((item) => {
            const isActive = activeModelId === `remote-${item.id}`;
            return (
              <View key={item.id} className="mb-3 bg-surface-1 border border-border rounded-xl overflow-hidden">
                <View className="p-4 flex-row items-center justify-between">
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2 mb-1">
                      <Text className="font-sans-semibold text-body-md text-primary-text">{item.name}</Text>
                      <View className="px-1.5 py-0.5 bg-surface-2 border border-border rounded">
                        <Text className="font-sans text-xs text-secondary-text">{item.providerType}</Text>
                      </View>
                      {isActive && (
                        <View className="px-1.5 py-0.5 bg-green-500/20 border border-green-500/50 rounded">
                          <Text className="font-sans text-xs text-green-500">Active</Text>
                        </View>
                      )}
                    </View>
                    <Text className="font-sans text-body-sm text-secondary-text/70">{item.baseUrl} • {item.modelName}</Text>
                  </View>
                  <View className="flex-row items-center gap-2">
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
                      <Trash2 size={16} color="#EF4444" />
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Add Provider Modal */}
      <Modal visible={showModal} transparent animationType="fade" onRequestClose={() => setShowModal(false)}>
        <View className="flex-1 bg-black/60 items-center justify-center p-4">
          <View className="bg-surface-1 border border-border rounded-2xl w-full p-6">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="font-sans-semibold text-h4 text-primary-text">Add API Provider</Text>
              <Pressable onPress={() => setShowModal(false)}>
                <X size={24} color={colors.secondaryText} />
              </Pressable>
            </View>

            <View className="flex-col gap-4">
              <View>
                <Text className="font-sans text-body-sm text-secondary-text mb-1">Provider Type</Text>
                <View className="flex-row gap-2">
                  <Pressable
                    onPress={() => setProviderType("openrouter")}
                    className={`flex-1 py-2 px-3 rounded-lg border ${
                      providerType === "openrouter"
                        ? "border-primary bg-primary/20"
                        : "border-border"
                    }`}
                  >
                    <Text className="font-sans text-body-sm text-center">
                      {providerType === "openrouter" ? "●" : "○"} OpenRouter
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setProviderType("custom_openai")}
                    className={`flex-1 py-2 px-3 rounded-lg border ${
                      providerType === "custom_openai"
                        ? "border-primary bg-primary/20"
                        : "border-border"
                    }`}
                  >
                    <Text className="font-sans text-body-sm text-center">
                      {providerType === "custom_openai" ? "●" : "○"} Custom OpenAI
                    </Text>
                  </Pressable>
                </View>
              </View>

              <View>
                <Text className="font-sans text-body-sm text-secondary-text mb-1">Name</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="My OpenRouter"
                  className="font-sans text-body-md text-primary-text bg-surface-2 border border-border rounded-lg px-4 py-3"
                />
              </View>

              <View>
                <Text className="font-sans text-body-sm text-secondary-text mb-1">Base URL</Text>
                <TextInput
                  value={baseUrl}
                  onChangeText={setBaseUrl}
                  placeholder={providerType === "openrouter" ? "https://openrouter.ai/api" : "http://localhost:11434"}
                  className="font-sans text-body-md text-primary-text bg-surface-2 border border-border rounded-lg px-4 py-3"
                />
              </View>

              <View>
                <Text className="font-sans text-body-sm text-secondary-text mb-1">API Key (optional for local)</Text>
                <TextInput
                  value={apiKey}
                  onChangeText={setApiKey}
                  placeholder="sk-... or leave empty for local"
                  secureTextEntry={true}
                  className="font-sans text-body-md text-primary-text bg-surface-2 border border-border rounded-lg px-4 py-3"
                />
              </View>

              <View>
                <Text className="font-sans text-body-sm text-secondary-text mb-1">Model Name</Text>
                <TextInput
                  value={modelName}
                  onChangeText={setModelName}
                  placeholder="gpt-4o-mini / llama3.2 / qwen2.5"
                  className="font-sans text-body-md text-primary-text bg-surface-2 border border-border rounded-lg px-4 py-3"
                />
              </View>

              <View className="flex-row gap-2 pt-2">
                <Pressable
                  onPress={() => setShowModal(false)}
                  className="flex-1 py-3 px-4 bg-surface-2 border border-border rounded-lg items-center"
                >
                  <Text className="font-sans text-body-md text-secondary-text">Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleSubmit}
                  disabled={validating}
                  className="flex-1 py-3 px-4 bg-primary border border-primary/50 rounded-lg items-center"
                >
                  {validating ? (
                    <ActivityIndicator size="small" color={colors.base} />
                  ) : (
                    <Text className="font-sans-semibold text-body-md text-base">Add</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function DownloadedModelsSection() {
  const { models, removeModel, uploadToBackend, setActiveModel, activeModelId } = useModelStore();

  const downloadedModels = models.filter(
    (m) => m.origin !== "remote_api" && m.downloadStatus === "completed",
  );

  if (downloadedModels.length === 0) {
    return null;
  }

  return (
    <View className="mb-6">
      <Text className="font-sans-semibold text-h4 text-primary-text mb-3">Downloaded Models</Text>
      {downloadedModels.map((item) => {
        const isActive = activeModelId === item.id;
        return (
          <View key={item.id} className="mb-3 bg-surface-1 border border-border rounded-xl overflow-hidden">
            <View className="p-4">
              <View className="flex-row items-center justify-between">
                <View className="flex-1">
                  <Text className="font-sans-semibold text-body-md text-primary-text">{item.name}</Text>
                  <View className="flex-row items-center gap-2 mt-1.5">
                    <View className="px-1.5 py-0.5 bg-surface-2 border border-border rounded">
                      <Text className="font-sans text-xs text-secondary-text">{formatBytes(item.files[0]?.size || 0)}</Text>
                    </View>
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
                    onPress={() => setActiveModel(item.id, "local")}
                    className="px-3 py-1.5 bg-primary/20 border border-primary/50 rounded-lg"
                  >
                    <Text className="font-sans text-body-sm text-primary">Activate</Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={() => uploadToBackend(item.id)}
                  className="px-3 py-1.5 bg-blue-500/20 border border-blue-500/50 rounded-lg"
                >
                  <Upload size={16} color="#3B82F6" />
                </Pressable>
                <Pressable
                  onPress={() => removeModel(item.id)}
                  className="px-3 py-1.5 bg-red-500/20 border border-red-500/50 rounded-lg"
                >
                  <Trash2 size={16} color="#EF4444" />
                </Pressable>
              </View>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

export default function ModelsScreen() {
  const { loadPersisted, presets, startDownload } = useModelStore();

  useEffect(() => {
    loadPersisted();
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-base">
      <ScrollView className="flex-1" contentContainerStyle={{ padding: spacing.md, paddingBottom: 100 }}>
        <View className="mb-6">
          <Text className="font-sans-semibold text-h2 text-primary-text mb-1">Models</Text>
          <Text className="font-sans text-body-md text-secondary-text">
            Download local models or configure remote API providers
          </Text>
        </View>

        <View className="mb-6">
          <Text className="font-sans-semibold text-h4 text-primary-text mb-3">Preset Models</Text>
          <Text className="font-sans text-body-sm text-secondary-text mb-4">
            Pre-selected compact models optimized for mobile
          </Text>
          {presets.map((item) => (
            <PresetModelCard
              key={item.id}
              preset={item}
              onDownload={(modelId, file) => startDownload(modelId, file)}
            />
          ))}
        </View>

        <HFSearchSection />
        <RemoteApiSection />
        <DownloadedModelsSection />
      </ScrollView>
    </SafeAreaView>
  );
}