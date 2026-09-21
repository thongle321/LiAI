/** Web-search settings: provider, key, result count, consent.
 *
 * Scaffolding for the deferred backend tool: shape is final, no tool
 * calls anything yet. Keys go straight to SecureStore, never KV.
 */

import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Check, Minus, Plus } from "lucide-react-native";

import { colors } from "../themes/tokens.ts";
import {
  MAX_RESULT_COUNT,
  MIN_RESULT_COUNT,
  SEARCH_PROVIDERS,
  type SearchProviderId,
} from "../lib/search-providers.ts";
import { useSearch } from "../store/search.ts";

function ProviderKeys({ id }: { id: SearchProviderId }) {
  const getProviderKey = useSearch((s) => s.getProviderKey);
  const setProviderKey = useSearch((s) => s.setProviderKey);
  const clearProviderKey = useSearch((s) => s.clearProviderKey);
  const [draft, setDraft] = useState("");
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => {
    getProviderKey(id).then((k) => setHasKey(k !== null && k !== ""));
  }, [id]);

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
    <View className="py-2">
      <View className="flex-row items-center gap-2">
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={hasKey ? "Key saved — enter to replace" : "Enter API key"}
          secureTextEntry
          autoCapitalize="none"
          className="flex-1 font-sans text-body-md text-primary-text bg-surface-2 border border-border rounded-lg px-4 py-3"
          placeholderTextColor={colors.secondaryText}
        />
        <Pressable onPress={save} className="px-4 py-3 bg-primary/20 border border-primary/50 rounded-lg">
          <Text className="font-sans text-body-sm text-primary">Save</Text>
        </Pressable>
        {hasKey && (
          <Pressable onPress={clear} className="px-4 py-3 bg-surface-2 border border-border rounded-lg">
            <Text className="font-sans text-body-sm text-secondary-text">Clear</Text>
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

  return (
    <View className="mb-6">
      <Text className="font-sans-semibold text-h4 text-primary-text mb-1">Web search</Text>
      <Pressable
        onPress={() => setConsented(!hasConsented)}
        className="flex-row items-center justify-between py-2.5"
      >
        <Text className="font-sans text-body-md text-primary-text">Allow web search</Text>
        <View
          className={`w-5 h-5 rounded-md border items-center justify-center ${
            hasConsented ? "bg-primary border-primary" : "border-border"
          }`}
        >
          {hasConsented && <Check size={14} color={colors.base} />}
        </View>
      </Pressable>
      <View className="flex-row items-center justify-between py-2.5">
        <Text className="font-sans text-body-md text-primary-text">Results</Text>
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => setResultCount(resultCount - 1)}
            disabled={resultCount <= MIN_RESULT_COUNT}
            className="p-2 rounded-lg border border-border"
          >
            <Minus size={16} color={colors.primary} />
          </Pressable>
          <Text className="font-sans text-body-md text-primary-text w-12 text-center">
            {resultCount}
          </Text>
          <Pressable
            onPress={() => setResultCount(resultCount + 1)}
            disabled={resultCount >= MAX_RESULT_COUNT}
            className="p-2 rounded-lg border border-border"
          >
            <Plus size={16} color={colors.primary} />
          </Pressable>
        </View>
      </View>
      <Text className="font-sans-semibold text-body-sm text-secondary-text mt-2 mb-1">Provider</Text>
      {SEARCH_PROVIDERS.map((p) => (
        <View key={p.id} className="py-1">
          <Pressable
            onPress={() => setActiveProvider(p.id)}
            className="flex-row items-center justify-between py-1.5"
          >
            <Text className="font-sans text-body-md text-primary-text">{p.name}</Text>
            {activeProviderId === p.id && <Check size={16} color={colors.primary} />}
          </Pressable>
          {activeProviderId === p.id && <ProviderKeys id={p.id} />}
        </View>
      ))}
    </View>
  );
}
