/** API Settings card: the Hugging Face token and whether to use it.
 *
 * The token is a secret, so it lives behind a button rather than in a field
 * sitting on the settings screen. "Use HF Token" is separate so a token
 * that starts causing auth failures can be parked without deleting it.
 */

import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { BottomSheet } from "@expo/ui";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { colors, scrim } from "../themes/tokens.ts";
import { useModelStore } from "../store/modelStore";
import { ActionRow, SettingsSection, ToggleRow } from "./SettingsRows.tsx";

function HfTokenSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const hfToken = useModelStore((s) => s.hfToken);
  const setHfToken = useModelStore((s) => s.setHfToken);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (open) setDraft("");
  }, [open]);

  return (
    <BottomSheet
      isPresented={open}
      onDismiss={onClose}
      containerColor={colors.surface1}
      scrimColor={scrim}
      contentPadding={20}
      testID="hf-token-sheet"
    >
      <KeyboardAwareScrollView
        className="flex-col"
        keyboardShouldPersistTaps="handled"
      >
        <Text className="mb-1 font-sans-semibold text-h3 text-primary-text">
          Hugging Face
        </Text>
        <Text className="mb-4 font-sans text-body-md text-secondary-text">
          {hfToken
            ? "Token is set. Required for accessing gated models."
            : "Set a token to access gated models from Hugging Face."}
        </Text>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={hfToken ? "Token saved — enter to replace" : "hf_..."}
          secureTextEntry
          autoCapitalize="none"
          className="input font-sans text-body-md"
          placeholderTextColor={colors.secondaryText}
          accessibilityLabel="Hugging Face token"
        />
        <View className="mt-4 flex-row gap-2">
          {hfToken ? (
            <Pressable
              onPress={() => void setHfToken(null)}
              className="btn btn--ghost flex-1"
              accessibilityRole="button"
              accessibilityLabel="Clear token"
            >
              <Text className="font-sans text-body-md text-primary">Clear</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => {
              if (draft.trim() === "") return;
              void setHfToken(draft.trim());
              setDraft("");
              onClose();
            }}
            className="btn btn--primary flex-1"
            accessibilityRole="button"
            accessibilityLabel="Save token"
          >
            <Text className="font-sans-semibold text-body-md text-on-primary">Save</Text>
          </Pressable>
        </View>
      </KeyboardAwareScrollView>
    </BottomSheet>
  );
}

export function HfTokenSettings() {
  const hfToken = useModelStore((s) => s.hfToken);
  const useHfToken = useModelStore((s) => s.useHfToken);
  const setUseHfToken = useModelStore((s) => s.setUseHfToken);
  const loadPersisted = useModelStore((s) => s.loadPersisted);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    void loadPersisted();
  }, []);

  return (
    <SettingsSection title="API Settings">
      <View className="row">
        <ActionRow
          label="Hugging Face Token"
          description={
            hfToken
              ? "Token is set. Required for accessing gated models."
              : "Set a token to access gated models from Hugging Face."
          }
          buttonLabel={hfToken ? "Update" : "Set Token"}
          variant="secondary"
          onPress={() => setSheetOpen(true)}
        />
      </View>
      <View className="row">
        <ToggleRow
          label="Use HF Token"
          description="Enable to use token for API requests. Disable if token is causing authentication issues."
          on={useHfToken}
          onPress={() => void setUseHfToken(!useHfToken)}
        />
      </View>
      <HfTokenSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </SettingsSection>
  );
}
