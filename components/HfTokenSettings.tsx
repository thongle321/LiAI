/** Hugging Face token setting: same SecureStore-backed token the Models
 * search uses, surfaced in Settings for discoverability. Needed only for
 * gated repos; sent per request, never logged.
 */

import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { colors } from "../themes/tokens.ts";
import { useModelStore } from "../store/modelStore";

export function HfTokenSettings() {
  const hfToken = useModelStore((s) => s.hfToken);
  const setHfToken = useModelStore((s) => s.setHfToken);
  const loadPersisted = useModelStore((s) => s.loadPersisted);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    void loadPersisted();
  }, []);

  async function save(): Promise<void> {
    if (draft.trim() === "") return;
    await setHfToken(draft.trim());
    setDraft("");
  }

  return (
    <View className="mb-6">
      <Text className="font-sans-semibold text-h4 text-primary-text mb-1">Hugging Face</Text>
      <Text className="font-sans text-body-sm text-secondary-text mb-2">
        {hfToken ? "Token saved on this device." : "Needed only for gated repos."}
      </Text>
      <View className="flex-row items-center gap-2">
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={hfToken ? "Token saved — enter to replace" : "hf_..."}
          secureTextEntry
          autoCapitalize="none"
          className="flex-1 font-sans text-body-md text-primary-text bg-surface-2 border border-border rounded-lg px-4 py-3"
          placeholderTextColor={colors.secondaryText}
        />
        <Pressable
          onPress={() => void save()}
          className="px-4 py-3 bg-primary/20 border border-primary/50 rounded-lg"
        >
          <Text className="font-sans text-body-sm text-primary">Save</Text>
        </Pressable>
        {hfToken && (
          <Pressable
            onPress={() => void setHfToken(null)}
            className="px-4 py-3 bg-surface-2 border border-border rounded-lg"
          >
            <Text className="font-sans text-body-sm text-secondary-text">Clear</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
