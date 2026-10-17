/** API Settings card: the Hugging Face token and whether to use it.
 *
 * The token is a secret, so it lives behind a button rather than in a field
 * sitting on the settings screen. "Use HF Token" is separate so a token
 * that starts causing auth failures can be parked without deleting it.
 */

import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { Eye, EyeOff, ExternalLink } from "lucide-react-native";

import { colors } from "../../themes/tokens.ts";
import { cn } from "../../utils/cn.ts";
import { useModelStore } from "../../store/modelStore";
import { useSnackbar } from "../snackbar.tsx";
import { Sheet } from "../sheet.tsx";
import { ActionRow, SettingsSection, ToggleRow } from "../settings-rows.tsx";

/** Their four steps, verbatim (HFTokenSheet en.json:786-791). */
const HF_STEPS = [
  "Go to huggingface.co and sign in",
  "Navigate to Settings > Access Tokens",
  `Create a new token with "read" access`,
  "Copy the token and paste it below",
];

function HfTokenSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const hfToken = useModelStore((s) => s.hfToken);
  const setHfToken = useModelStore((s) => s.setHfToken);
  const { showSnackbar } = useSnackbar();
  const [draft, setDraft] = useState("");
  const [secure, setSecure] = useState(true);
  const [busy, setBusy] = useState<"save" | "reset" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Reset transient state only on the false->true OPEN transition: the
  // store flips hfToken synchronously on save, so keying off hfToken alone
  // would re-run this MID-WRITE — clearing the busy lock (double-save) and
  // snapping the eye toggle back to hidden.
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open && !wasOpen.current) {
      // Q7: the saved secret prefills, masked — their open behavior.
      setDraft(hfToken ?? "");
      setSecure(true);
      setError(null);
      setBusy(null);
    }
    wasOpen.current = open;
  }, [open, hfToken]);

  async function save(): Promise<void> {
    if (busy !== null) return;
    setBusy("save");
    setError(null);
    try {
      await setHfToken(draft.trim());
      onClose();
      showSnackbar("Token saved successfully", { duration: 3000 });
    } catch {
      setError("Error saving token");
    } finally {
      setBusy(null);
    }
  }

  async function reset(): Promise<void> {
    if (busy !== null) return;
    setBusy("reset");
    setError(null);
    try {
      await setHfToken(null);
      onClose();
      showSnackbar("Token removed successfully", { duration: 3000 });
    } catch {
      setError("Error saving token");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Sheet
      visible={open}
      onClose={onClose}
      title="Hugging Face Token"
      testID="hf-token-sheet"
      actions={
        /* Pinned action row (PocketPal's Sheet.Actions) — see Sheet.tsx. */
        <View className="flex-row items-center justify-between gap-2">
          {hfToken ? (
            <Pressable
              onPress={() => void reset()}
              disabled={busy !== null}
              className={
                busy !== null ? "btn btn--ghost active:opacity-80 btn--disabled flex-1" : "btn btn--ghost active:opacity-80 flex-1"
              }
              accessibilityRole="button"
              accessibilityLabel="Reset Token"
            >
              {busy === "reset" ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text className="text-body">Reset Token</Text>
              )}
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => void save()}
            disabled={!draft.trim() || busy !== null}
className={
              !draft.trim() || busy !== null
                ? "btn btn--primary active:opacity-80 btn--disabled flex-1"
                : "btn btn--primary active:opacity-80 flex-1"
            }
            accessibilityRole="button"
            accessibilityLabel="Save Token"
          >
            {busy === "save" ? (
              <ActivityIndicator size="small" color={colors.surface1} />
            ) : (
              <Text className="text-action">Save Token</Text>
            )}
          </Pressable>
        </View>
      }
    >
      <Text className="mb-4 font-sans text-body-md text-primary-text">
        Required to access gated models
      </Text>
      {/* Their instructions card: Mist box, four numbered steps, live link. */}
      <View className="bg-surface-2 p-4 rounded-lg">
        <Text className="mb-2 font-sans-semibold text-body-md text-primary-text">
          How to get a token:
        </Text>
        {HF_STEPS.map((step, index) => (
          <Text
            key={step}
            className="mb-2 font-sans text-body-md text-primary-text"
          >
            {`${index + 1}. ${step}`}
          </Text>
        ))}
        <Pressable
          onPress={() =>
            void Linking.openURL("https://huggingface.co/settings/tokens").catch(() => {})
          }
          className="mt-1 self-start flex-row items-center gap-1"
          accessibilityRole="link"
          accessibilityLabel="Get a token from huggingface.co"
        >
          <Text className="font-sans text-body-md text-primary-text underline">
            Get a token from huggingface.co
          </Text>
          <ExternalLink size={14} color={colors.primaryText} />
        </Pressable>
      </View>
      <Text className="mt-6 mb-1 font-sans text-body-md text-primary-text">
        Personal Access Token
      </Text>
      <View className="relative">
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Paste your token here"
          secureTextEntry={secure}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          className={cn("input font-sans text-body-md", "pr-12")}
          placeholderTextColor={colors.secondaryText}
          accessibilityLabel="Personal Access Token"
        />
        <Pressable
          onPress={() => setSecure((s) => !s)}
          className="absolute right-0 top-0 h-12 w-12 items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel={secure ? "Show token" : "Hide token"}
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

export function HfTokenSettings() {
  const hfToken = useModelStore((s) => s.hfToken);
  const useHfToken = useModelStore((s) => s.useHfToken);
  const setUseHfToken = useModelStore((s) => s.setUseHfToken);
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <SettingsSection>
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
