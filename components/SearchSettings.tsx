/** Web-search settings: provider, key, result count, consent.
 *
 * Keys go straight to SecureStore, never KV; the on-device talent
 * reads them per run (consent-gated).
 */

import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { colors } from "../themes/tokens.ts";
import {
  MAX_RESULT_COUNT,
  MIN_RESULT_COUNT,
  SEARCH_PROVIDERS,
  type SearchProviderId,
} from "../lib/search-providers.ts";
import { useSearch } from "../store/search.ts";
import { PickerRow, SettingsSection, StepperRow, ToggleRow } from "./SettingsRows.tsx";

function ProviderKeys({ id }: { id: SearchProviderId }) {
  const getProviderKey = useSearch((s) => s.getProviderKey);
  const setProviderKey = useSearch((s) => s.setProviderKey);
  const clearProviderKey = useSearch((s) => s.clearProviderKey);
  const [draft, setDraft] = useState("");
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => {
    getProviderKey(id).then(
      (k) => setHasKey(k !== null && k !== ""),
      () => setHasKey(false),
    );
  }, [id, getProviderKey]);

  async function save(): Promise<void> {
    if (draft.trim() === "") return;
    await setProviderKey(id, draft.trim());
    setDraft("");
    setHasKey(true);
  }

  async function clear(): Promise<void> {
    await clearProviderKey(id);
    setHasKey(false);
  }

  return (
    <View className="row">
      <View className="flex-row items-center gap-2">
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={hasKey ? "Key saved — enter to replace" : "Enter API key"}
          secureTextEntry
          autoCapitalize="none"
          className="input flex-1 font-sans text-body-md"
          placeholderTextColor={colors.secondaryText}
          accessibilityLabel={`${id} API key`}
        />
        <Pressable
          onPress={save}
          className="btn btn--primary min-h-12 px-5 py-2"
          accessibilityRole="button"
          accessibilityLabel="Save key"
        >
          <Text className="font-sans text-body-sm text-on-primary">Save</Text>
        </Pressable>
        {hasKey && (
          <Pressable
            onPress={clear}
            className="btn btn--ghost min-h-12 px-5 py-2"
            accessibilityRole="button"
            accessibilityLabel="Clear key"
          >
            <Text className="font-sans text-body-sm text-primary">Clear</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export function SearchSettings() {
  const {
    activeProviderId,
    resultCount,
    hasConsented,
    load,
    setActiveProvider,
    setResultCount,
    setConsented,
  } = useSearch();

  useEffect(() => {
    void load();
  }, []);

  // The key editor follows the selected provider rather than sitting under
  // every row, so the picker row stays a single line.
  const selectedProvider = SEARCH_PROVIDERS.find((p) => p.id === activeProviderId);
  const providerIds = SEARCH_PROVIDERS.map((p) => p.id);

  return (
    <>
      <SettingsSection
        title="Web search"
        description="Searches leave your device and go to the provider below."
      >
        <View className="row">
          <ToggleRow
            label="Allow web search"
            description="Let the model look things up. Required before any search is sent."
            on={hasConsented}
            onPress={() => setConsented(!hasConsented)}
          />
        </View>
        <View className="row">
          <StepperRow
            label="Results"
            description="How many pages a search may bring back."
            display={`${resultCount}`}
            onMinus={() => setResultCount(resultCount - 1)}
            onPlus={() => setResultCount(resultCount + 1)}
            minusDisabled={resultCount <= MIN_RESULT_COUNT}
            plusDisabled={resultCount >= MAX_RESULT_COUNT}
          />
        </View>
      </SettingsSection>
      <SettingsSection
        title="Provider"
        description="Which search service answers, and the key it uses."
      >
        <View className="row">
          {/* Three providers is a closed set that does not fit inline, so
              it is a native menu rather than three radio rows. */}
          <PickerRow
            label="Service"
            description="Tavily or Brave."
            options={providerIds}
            value={activeProviderId}
            onChange={(next) => setActiveProvider(next as SearchProviderId)}
            displayFor={(id) => SEARCH_PROVIDERS.find((p) => p.id === id)?.name ?? id}
          />
        </View>
        {/* The key belongs to the provider, so it is a row in the same card
            rather than a loose editor hanging below it. */}
        {selectedProvider !== undefined && <ProviderKeys id={selectedProvider.id} />}
      </SettingsSection>
    </>
  );
}
