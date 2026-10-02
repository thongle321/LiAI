/** Internet Search card: consent, provider, key, result count.
 *
 * Consent is a button ("I understand" -> "Revoke"), not a switch: it is a
 * one-way acknowledgement of something leaving the device, and a switch
 * that silently flips both ways is the wrong control for it. Keys go
 * straight to SecureStore, never KV, and sit behind a button rather than on
 * the screen.
 */

import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { colors } from "../themes/tokens.ts";
import {
  MAX_RESULT_COUNT,
  MIN_RESULT_COUNT,
  SEARCH_PROVIDERS,
  type SearchProviderId,
} from "../lib/search-providers.ts";
import { useSearch } from "../store/search.ts";
import { Sheet } from "./Sheet.tsx";
import {
  ActionRow,
  PickerRow,
  SettingsSection,
  SliderRow,
} from "./SettingsRows.tsx";

const CONSENT_TEXT =
  "When the assistant searches the web, your query is sent to the provider below over the internet. " +
  "When it reads a page, the URL and page content may be sent to a default reader service if the " +
  "provider has no native reader. Keys and queries are never stored by us.";

function providerName(id: SearchProviderId): string {
  return SEARCH_PROVIDERS.find((p) => p.id === id)?.name ?? id;
}

/** The key editor, as a sheet: a secret should not sit on the settings
 *  screen waiting to be read over someone's shoulder. */
function ProviderKeySheet({
  providerId,
  onClose,
  onChanged,
}: {
  providerId: SearchProviderId | null;
  onClose: () => void;
  /** Fired after a save or clear, so the row behind the sheet stops
   *  claiming no key is set while one is. */
  onChanged: () => void;
}) {
  const getProviderKey = useSearch((s) => s.getProviderKey);
  const setProviderKey = useSearch((s) => s.setProviderKey);
  const clearProviderKey = useSearch((s) => s.clearProviderKey);
  const [draft, setDraft] = useState("");
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => {
    if (providerId === null) return;
    setDraft("");
    getProviderKey(providerId).then(
      (k) => setHasKey(k !== null && k !== ""),
      () => setHasKey(false),
    );
  }, [providerId, getProviderKey]);

  async function save(): Promise<void> {
    if (!providerId || draft.trim() === "") return;
    await setProviderKey(providerId, draft.trim());
    setDraft("");
    setHasKey(true);
    onChanged();
  }

  return (
    // Short sheet on the shared Sheet: TrueSheet's auto detent sizes to
    // the content, and keyboard avoidance comes from the wrapper.
    <Sheet
      visible={providerId !== null}
      onClose={onClose}
      title={providerId === null ? "" : providerName(providerId)}
      testID="search-key-sheet"
    >
        <Text className="mb-4 font-sans text-body-md text-secondary-text">
          {hasKey ? "A key is saved for this provider." : "No key set for this provider."}
        </Text>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={hasKey ? "Key saved — enter to replace" : "Enter API key"}
          secureTextEntry
          autoCapitalize="none"
          className="input font-sans text-body-md"
          placeholderTextColor={colors.secondaryText}
          accessibilityLabel={`${providerId ?? ""} API key`}
        />
        <View className="mt-4 flex-row gap-2">
          {hasKey ? (
            <Pressable
              onPress={() => {
                if (providerId) void clearProviderKey(providerId);
                setHasKey(false);
                onChanged();
              }}
              className="btn btn--ghost flex-1"
              accessibilityRole="button"
              accessibilityLabel="Clear key"
            >
              <Text className="font-sans text-body-md text-primary">Clear</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => void save()}
            className="btn btn--primary flex-1"
            accessibilityRole="button"
            accessibilityLabel="Save key"
          >
            <Text className="font-sans-semibold text-body-md text-on-primary">Save</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

export function SearchSettings() {
  const {
    hasConsented,
    setConsented,
    activeProviderId,
    setActiveProvider,
    resultCount,
    setResultCount,
    getProviderKey,
    load,
  } = useSearch();
  const [keySheetFor, setKeySheetFor] = useState<SearchProviderId | null>(null);
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  // Re-checked whenever the provider or consent changes, and again after the
  // key sheet writes: the button says whether a key exists, and that moves
  // when the provider does or when one is saved.
  const refreshKey = useCallback(() => {
    if (!hasConsented) {
      setHasKey(false);
      return;
    }
    void getProviderKey(activeProviderId).then(
      (k) => setHasKey(k !== null && k !== ""),
      () => setHasKey(false),
    );
  }, [hasConsented, activeProviderId, getProviderKey]);

  useEffect(refreshKey, [refreshKey]);

  const providerIds = SEARCH_PROVIDERS.map((p) => p.id);

  return (
    <SettingsSection
      title="Internet Search"
      description="Searches leave this device. Bring your own key — we never hold it."
    >
      {hasConsented ? (
        <View className="row">
          <ActionRow
            label="Searching the web is enabled"
            description={CONSENT_TEXT}
            buttonLabel="Revoke"
            variant="secondary"
            onPress={() => setConsented(false)}
          />
        </View>
      ) : (
        <View className="row">
          <ActionRow
            label="Searches leave your device"
            description={CONSENT_TEXT}
            buttonLabel="I understand"
            onPress={() => setConsented(true)}
          />
        </View>
      )}
      <View className="row">
        <PickerRow<SearchProviderId>
          label="Search provider"
          description="Which service answers, and which key it uses."
          options={providerIds}
          value={activeProviderId}
          onChange={(next) => setActiveProvider(next)}
          displayFor={providerName}
        />
      </View>
      <View className="row">
        <ActionRow
          label="API key"
          description={
            hasConsented
              ? hasKey
                ? `Key is set for ${providerName(activeProviderId)}.`
                : `No key set for ${providerName(activeProviderId)}.`
              : "Accept the disclosure above to set a key and enable search."
          }
          buttonLabel={hasKey ? "Update Key" : "Set Key"}
          variant="secondary"
          onPress={() => setKeySheetFor(activeProviderId)}
        />
      </View>
      <View className="row">
        <SliderRow
          label="Results per search"
          description="Fewer results keep more room in the model's context."
          display={`${resultCount}`}
          value={resultCount}
          min={MIN_RESULT_COUNT}
          max={MAX_RESULT_COUNT}
          step={1}
          onChange={setResultCount}
        />
      </View>
      <ProviderKeySheet
        providerId={keySheetFor}
        onClose={() => setKeySheetFor(null)}
        onChanged={refreshKey}
      />
    </SettingsSection>
  );
}
