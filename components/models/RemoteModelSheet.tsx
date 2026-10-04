/** Add-API-provider modal. Provider management lives in Ready rows; this is the add flow. */

import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { CheckCircle2, Circle } from "lucide-react-native";

import { colors } from "../../themes/tokens.ts";
import { useModelStore } from "../../store/modelStore";
import { Sheet } from "../Sheet.tsx";
import type { RemoteApiProvider } from "../../types/models";

export function RemoteModelSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  // Stable selectors: actions plus one boolean flag, each subscribing
  // alone so unrelated store writes never touch this form.
  const addRemoteApi = useModelStore((s) => s.addRemoteApi);
  const validateAndRecord = useModelStore((s) => s.validateAndRecord);
  const privacyAcknowledged = useModelStore((s) => s.privacyAcknowledged);
  const acknowledgePrivacy = useModelStore((s) => s.acknowledgePrivacy);
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [modelName, setModelName] = useState("");
  const [providerType, setProviderType] = useState<"custom_openai" | "openrouter">(
    "custom_openai",
  );
  const [validating, setValidating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [validationWarning, setValidationWarning] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!name || !baseUrl || !modelName) {
      setFormError("Please fill in all required fields");
      return;
    }
    setFormError(null);
    setValidationWarning(null);

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
      setValidationWarning("Could not validate API endpoint. Adding anyway.");
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
    // Short sheet on the shared Sheet: TrueSheet's auto detent sizes to
    // the content, and keyboard avoidance comes from the wrapper. This
    // also resolves the accepted iOS risk above: TrueSheet owns the
    // keyboard natively instead of relying on window resize.
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Add API Provider"
      // Pinned, so Add and Cancel stay reachable with the keyboard up —
      // which is the whole reason this surface was full-height before.
      footer={
        <View className="flex-row gap-2">
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
      }
      testID="remote-model-sheet"
    >
      <View className="flex-col gap-4">
        {formError ? (
          <Text className="font-sans text-body-sm text-error">{formError}</Text>
        ) : null}
        {validationWarning ? (
          <Text className="font-sans text-body-sm text-warning">{validationWarning}</Text>
        ) : null}
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
              className={`menu-row flex-1 rounded-lg border items-center justify-center ${
                providerType === "openrouter" ? "border-primary bg-surface-3" : "border-border"
              }`}
              accessibilityRole="radio"
              accessibilityLabel="OpenRouter"
              accessibilityState={{ selected: providerType === "openrouter" }}
            >
              <View className="flex-row items-center justify-center gap-2">
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
              className={`menu-row flex-1 rounded-lg border items-center justify-center ${
                providerType === "custom_openai" ? "border-primary bg-surface-3" : "border-border"
              }`}
              accessibilityRole="radio"
              accessibilityLabel="Custom OpenAI-compatible endpoint"
              accessibilityState={{ selected: providerType === "custom_openai" }}
            >
              <View className="flex-row items-center justify-center gap-2">
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

      </View>
    </Sheet>
  );
}
