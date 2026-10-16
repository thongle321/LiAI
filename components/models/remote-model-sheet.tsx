/** Add-API-provider modal. Provider management lives in Ready rows; this is the add flow. */

import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { CheckCircle2, Circle } from "lucide-react-native";

import { colors } from "../../themes/tokens.ts";
import { useModelStore } from "../../store/modelStore";
import { Sheet } from "../sheet.tsx";
import {
  useCameraPermission,
} from "react-native-vision-camera";
import { ServerQRScanner } from "./server-qr-scanner.tsx";
import { ScanLine } from "lucide-react-native";
import { normalizeTimeoutMs } from "../../services/inference/remote-engine.ts";
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
  // Seconds in the field, ms on the provider; empty = engine default.
  const [timeoutSecs, setTimeoutSecs] = useState("");
  const [providerType, setProviderType] = useState<"custom_openai" | "openrouter">(
    "custom_openai",
  );
  const [validating, setValidating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [validationWarning, setValidationWarning] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const { hasPermission, requestPermission } = useCameraPermission();

  const handleSubmit = async () => {
    if (!name || !baseUrl || !modelName) {
      setFormError("Please fill in all required fields");
      return;
    }
    setFormError(null);
    setValidationWarning(null);

    // The one rule (normalizeTimeoutMs) decides what may be stored:
    // empty means unset (default), anything non-positive/non-finite is
    // a form error, never a stored value.
    const trimmedTimeout = timeoutSecs.trim();
    const timeoutMs =
      trimmedTimeout === ""
        ? undefined
        : normalizeTimeoutMs(Math.round(Number(trimmedTimeout) * 1000));
    if (trimmedTimeout !== "" && timeoutMs === undefined) {
      setFormError("Timeout must be a positive number of seconds");
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
      timeoutMs,
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
    setTimeoutSecs("");
    setValidating(false);
  };

  return (
    <>
      {/* Short sheet on the shared Sheet: TrueSheet's auto detent sizes to
          the content, and keyboard avoidance comes from the wrapper. This
          also resolves the accepted iOS risk above: TrueSheet owns the
          keyboard natively instead of relying on window resize. */}
      <Sheet
      visible={visible}
      onClose={onClose}
      title="Add API Provider"
      // Pinned, so Add and Cancel stay reachable with the keyboard up —
      // which is the whole reason this surface was full-height before.
      // PocketPal's RemoteModelSheet does the same with Sheet.Actions.
      actions={
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
          <View className="flex-row items-center gap-2">
            <TextInput
              style={{ flex: 1 }}
            value={baseUrl}
            onChangeText={setBaseUrl}
            placeholder={
              providerType === "openrouter"
                ? "https://openrouter.ai/api"
                : "http://localhost:11434"
            }
            className="font-sans text-body-md text-primary-text bg-surface-2 border border-border rounded-lg px-5 py-3"
          />
            <Pressable
              onPress={() => {
                (async () => {
                  if (!hasPermission) {
                    const res = await requestPermission();
                    if (!res) {
                      Alert.alert(
                        "Camera access denied",
                        "Enable camera permission to scan a server QR code.",
                      );
                      return;
                    }
                  }
                  setScannerOpen(true);
                })();
              }}
              className="btn btn--secondary"
              accessibilityRole="button"
              accessibilityLabel="Scan QR code"
              testID="remote-url-scan"
            >
              <ScanLine size={20} color={colors.primary} />
            </Pressable>
          </View>
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

        <View>
          <Text className="font-sans text-body-sm text-secondary-text mb-1">
            Request Timeout (seconds)
          </Text>
          <TextInput
            value={timeoutSecs}
            onChangeText={setTimeoutSecs}
            placeholder="Leave empty for default"
            keyboardType="decimal-pad"
            accessibilityLabel="Request timeout in seconds"
            className="font-sans text-body-md text-primary-text bg-surface-2 border border-border rounded-lg px-5 py-3"
          />
        </View>

      </View>
    </Sheet>

    <ServerQRScanner
      visible={scannerOpen}
      onScanned={(receivedUrl) => {
        setBaseUrl(receivedUrl);
        setScannerOpen(false);
      }}
      onClose={() => setScannerOpen(false)}
    />
    </>
  );
}
