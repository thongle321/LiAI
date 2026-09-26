/** Add-API-provider modal. Provider management lives in Ready rows; this is the add flow. */

import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { BottomSheet } from "@expo/ui";
import { CheckCircle2, Circle, X } from "lucide-react-native";

import { colors, scrim } from "../../themes/tokens.ts";
import { useModelStore } from "../../store/modelStore";
import type { RemoteApiProvider } from "../../types/models";

export function RemoteModelSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { addRemoteApi, validateAndRecord, privacyAcknowledged, acknowledgePrivacy } =
    useModelStore();
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [modelName, setModelName] = useState("");
  const [providerType, setProviderType] = useState<"custom_openai" | "openrouter">(
    "custom_openai",
  );
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

    const isValid = await validateAndRecord(provider);
    if (!isValid) {
      Alert.alert("Warning", "Could not validate API endpoint. Adding anyway.");
    }

    addRemoteApi(provider);
    acknowledgePrivacy();
    onClose();
    setName("");
    setBaseUrl("");
    setApiKey("");
    setModelName("");
    setValidating(false);
  };

  return (
    <BottomSheet
      isPresented={visible}
      onDismiss={onClose}
      containerColor={colors.surface1}
      scrimColor={scrim}
      contentPadding={20}
      snapPoints={['full']}
      testID="remote-model-sheet"
    >
      <ScrollView>
        <View className="mb-4 flex-row items-center justify-between">
          <Text className="font-sans-semibold text-h3 text-primary-text">Add API Provider</Text>
          <Pressable
            onPress={onClose}
            className="h-11 w-11 items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <X size={20} color={colors.secondaryText} />
          </Pressable>
        </View>

          <View className="flex-col gap-4">
            {!privacyAcknowledged && (
              <Text className="font-sans text-body-sm text-secondary-text">
                API keys stay on this device in encrypted storage.
              </Text>
            )}

            <View>
              <Text className="font-sans text-body-sm text-secondary-text mb-1">Provider Type</Text>
              <View className="flex-row gap-2">
                <Pressable
                  onPress={() => setProviderType("openrouter")}
                  className={`flex-1 py-2 px-3 rounded-lg border ${
                    providerType === "openrouter" ? "border-primary bg-primary/20" : "border-border"
                  }`}
                >
                  <View className="flex-row items-center justify-center gap-1.5">
                    {providerType === "openrouter" ? (
                      <CheckCircle2 size={14} color={colors.primary} />
                    ) : (
                      <Circle size={14} color={colors.secondaryText} />
                    )}
                    <Text className="font-sans text-body-sm text-primary-text">OpenRouter</Text>
                  </View>
                </Pressable>
                <Pressable
                  onPress={() => setProviderType("custom_openai")}
                  className={`flex-1 py-2 px-3 rounded-lg border ${
                    providerType === "custom_openai" ? "border-primary bg-primary/20" : "border-border"
                  }`}
                >
                  <View className="flex-row items-center justify-center gap-1.5">
                    {providerType === "custom_openai" ? (
                      <CheckCircle2 size={14} color={colors.primary} />
                    ) : (
                      <Circle size={14} color={colors.secondaryText} />
                    )}
                    <Text className="font-sans text-body-sm text-primary-text">Custom OpenAI</Text>
                  </View>
                </Pressable>
              </View>
            </View>

            <View>
              <Text className="font-sans text-body-sm text-secondary-text mb-1">Name</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="My OpenRouter"
                className="font-sans text-body-md text-primary-text bg-surface-2 border border-border rounded-lg px-5 py-3"
              />
            </View>

            <View>
              <Text className="font-sans text-body-sm text-secondary-text mb-1">Base URL</Text>
              <TextInput
                value={baseUrl}
                onChangeText={setBaseUrl}
                placeholder={
                  providerType === "openrouter"
                    ? "https://openrouter.ai/api"
                    : "http://localhost:11434"
                }
                className="font-sans text-body-md text-primary-text bg-surface-2 border border-border rounded-lg px-5 py-3"
              />
            </View>

            <View>
              <Text className="font-sans text-body-sm text-secondary-text mb-1">
                API Key (optional for local)
              </Text>
              <TextInput
                value={apiKey}
                onChangeText={setApiKey}
                placeholder="sk-... or leave empty for local"
                secureTextEntry={true}
                className="font-sans text-body-md text-primary-text bg-surface-2 border border-border rounded-lg px-5 py-3"
              />
            </View>

            <View>
              <Text className="font-sans text-body-sm text-secondary-text mb-1">Model Name</Text>
              <TextInput
                value={modelName}
                onChangeText={setModelName}
                placeholder="gpt-4o-mini / llama3.2 / qwen2.5"
                className="font-sans text-body-md text-primary-text bg-surface-2 border border-border rounded-lg px-5 py-3"
              />
            </View>

            <View className="flex-row gap-2 pt-2">
              <Pressable
                onPress={onClose}
                className="btn btn--secondary flex-1"
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text className="font-sans text-body-md text-primary">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSubmit}
                disabled={validating}
                className="btn btn--primary flex-1"
                accessibilityRole="button"
                accessibilityLabel="Add provider"
              >
                {validating ? (
                  <ActivityIndicator size="small" color={colors.onPrimary} />
                ) : (
                  <Text className="font-sans-semibold text-body-md text-on-primary">Add</Text>
                )}
              </Pressable>
            </View>
          </View>
        </ScrollView>
    </BottomSheet>
  );
}
