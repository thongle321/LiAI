/** Add API provider modal (extracted from the deleted Remote section).
 *
 * Provider list management now lives in Ready-group rows; only the
 * add flow remains, opened from the FAB.
 */

import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { X } from "lucide-react-native";

import { colors } from "../themes/tokens.ts";
import { useModelStore } from "../store/modelStore";
import type { RemoteApiProvider } from "../types/models";

export function RemoteApiModal({
  showModal,
  setShowModal,
}: {
  showModal: boolean;
  setShowModal: (v: boolean) => void;
}) {
  const { addRemoteApi, validateRemoteApi } = useModelStore();
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
  );
}
