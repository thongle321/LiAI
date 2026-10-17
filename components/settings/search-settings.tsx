/** Internet Search card: consent, provider, key, result count.
 *
 * Consent is a button ("I understand" -> "Revoke"), not a switch: it is a
 * one-way acknowledgement of something leaving the device, and a switch
 * that silently flips both ways is the wrong control for it. Keys go
 * straight to SecureStore, never KV, and sit behind a button rather than on
 * the screen.
 */

import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { Eye, EyeOff } from "lucide-react-native";

import { colors } from "../../themes/tokens.ts";
import { cn } from "../../utils/cn.ts";
import {
  MAX_RESULT_COUNT,
  MIN_RESULT_COUNT,
  SEARCH_PROVIDERS,
  type SearchProviderId,
} from "../../services/search/search-providers.ts";
import { useShallow } from "zustand/shallow";
import { useSearch } from "../../store/search.ts";
import { Sheet } from "../sheet.tsx";
import {
  ActionRow,
  PickerRow,
  SettingsSection,
  SliderRow,
} from "../settings-rows.tsx";

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
  const [secure, setSecure] = useState(true);
  const [busy, setBusy] = useState<"save" | "clear" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (providerId === null) return;
    // Stale guard: a slow read landing after close/reopen (or a provider
    // switch) must not overwrite the newly opened field with the old key.
    let stale = false;
    setError(null);
    setBusy(null);
    setSecure(true);
    // Q7: the saved key prefills, masked — their open behavior.
    getProviderKey(providerId).then(
      (k) => {
        if (stale) return;
        setDraft(k ?? "");
        setHasKey(k !== null && k !== "");
      },
      () => {
        if (stale) return;
        setDraft("");
        setHasKey(false);
      },
    );
    return () => {
      stale = true;
    };
  }, [providerId, getProviderKey]);

  async function save(): Promise<void> {
    if (!providerId || busy !== null) return;
    setBusy("save");
    setError(null);
    try {
      await setProviderKey(providerId, draft.trim());
      setHasKey(true);
      onChanged();
      onClose();
    } catch {
      // Their failure copy, inline: the sheet stays open (Q3 hybrid).
      setError("Couldn't update the key. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function clear(): Promise<void> {
    if (!providerId || busy !== null) return;
    setBusy("clear");
    setError(null);
    try {
      await clearProviderKey(providerId);
      setHasKey(false);
      setDraft("");
      onChanged();
      onClose();
    } catch {
      setError("Couldn't update the key. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    // Short sheet on the shared Sheet: TrueSheet's auto detent sizes to
    // the content, and the dialog's native resize keeps it above the
    // keyboard — the body never pads or scrolls for the keyboard itself.
    <Sheet
      visible={providerId !== null}
      onClose={onClose}
      title="API key"
      testID="search-key-sheet"
      actions={
        /* Pinned action row (PocketPal's Sheet.Actions) — see Sheet.tsx. */
        <View className="flex-row items-center justify-between gap-2">
          {hasKey ? (
            <Pressable
              onPress={() => void clear()}
              disabled={busy !== null}
              className={
                busy !== null ? "btn btn--ghost btn--disabled flex-1" : "btn btn--ghost flex-1"
              }
              accessibilityRole="button"
              accessibilityLabel="Clear Key"
            >
              {busy === "clear" ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text className="font-sans text-body-md text-primary">Clear Key</Text>
              )}
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => void save()}
            disabled={!draft.trim() || busy !== null}
            className={
              !draft.trim() || busy !== null
                ? "btn btn--primary btn--disabled flex-1"
                : "btn btn--primary flex-1"
            }
            accessibilityRole="button"
            accessibilityLabel="Set Key"
          >
            {busy === "save" ? (
              <ActivityIndicator size="small" color={colors.surface1} />
            ) : (
              <Text className="font-sans-semibold text-body-md text-on-primary">Set Key</Text>
            )}
          </Pressable>
        </View>
      }
    >
      <Text className="mb-4 font-sans text-body-md text-primary-text">
        {/* Q8: their sentence, brand-swapped. */}
        {"Let the assistant search the web with its own tools. Bring your own API key — LiAI never holds your keys or routes your queries."}
      </Text>
      <Text className="mb-1 font-sans text-body-md text-primary-text">API key</Text>
      <View className="relative">
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={`Paste your ${
            providerId === null ? "" : providerName(providerId)
          } API key`}
          secureTextEntry={secure}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          className={cn("input font-sans text-body-md", "pr-12")}
          placeholderTextColor={colors.secondaryText}
          accessibilityLabel={`${providerId ?? ""} API key`}
        />
        <Pressable
          onPress={() => setSecure((s) => !s)}
          className="absolute right-0 top-0 h-12 w-12 items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel={secure ? "Show API key" : "Hide API key"}
        >
          {secure ? (
            <Eye size={24} color={colors.secondaryText} />
          ) : (
            <EyeOff size={24} color={colors.secondaryText} />
          )}
        </Pressable>
      </View>
      {error !== null ? (
        <Text className="mt-2 font-sans text-body-sm text-error">{error}</Text>
      ) : null}
    </Sheet>
  );
}

export function SearchSettings() {
  // One useShallow unit: all eight fields render here, so the row
  // re-renders only when one of them changes — never on unrelated
  // search-store writes.
  const {
    hasConsented,
    setConsented,
    activeProviderId,
    setActiveProvider,
    resultCount,
    setResultCount,
    getProviderKey,
    load,
  } = useSearch(
    useShallow((s) => ({
      hasConsented: s.hasConsented,
      setConsented: s.setConsented,
      activeProviderId: s.activeProviderId,
      setActiveProvider: s.setActiveProvider,
      resultCount: s.resultCount,
      setResultCount: s.setResultCount,
      getProviderKey: s.getProviderKey,
      load: s.load,
    })),
  );
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
          disabled={!hasConsented}
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
