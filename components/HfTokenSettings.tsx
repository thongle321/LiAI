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
      <Text className="mb-2 font-sans-semibold text-h4 text-primary-text">Hugging Face</Text>
      <Text className="mb-3 font-sans text-body-sm text-secondary-text">
        {hfToken ? "Token saved on this device." : "Needed only for gated repos."}
      </Text>
      <View className="rows">
        <View className="row flex-row items-center gap-2">
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={hfToken ? "Token saved — enter to replace" : "hf_..."}
            secureTextEntry
            autoCapitalize="none"
            className="input flex-1 font-sans text-body-md"
            placeholderTextColor={colors.secondaryText}
            accessibilityLabel="Hugging Face token"
          />
          <Pressable
            onPress={() => void save()}
            className="btn btn--primary min-h-12 px-5 py-2"
            accessibilityRole="button"
            accessibilityLabel="Save token"
          >
            <Text className="font-sans text-body-sm text-on-primary">Save</Text>
          </Pressable>
          {hfToken && (
            <Pressable
              onPress={() => void setHfToken(null)}
              className="btn btn--ghost min-h-12 px-5 py-2"
              accessibilityRole="button"
              accessibilityLabel="Clear token"
            >
              <Text className="font-sans text-body-sm text-primary">Clear</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}
