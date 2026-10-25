/** Companion card for the Companions grid — PocketPal's SquarePalCard shape.
 *
 *  An inset letter avatar (solid `color[0]`, centered first letter in the
 *  contrast color) with a chat badge at its bottom-right, then the name row
 *  with share + delete icons, a two-line description and the "model not
 *  downloaded" pill when the companion's linked model is out of the
 *  catalog. Owned by reference parity:
 *  pocketpal-ai/src/screens/PalsScreen/components/SquarePalCard.
 *
 *  Deviations, deliberate:
 *  - No gradient — this project has no expo-linear-gradient; the reference
 *    itself falls back to `color[0]` as a solid fill. The reference's OTHER
 *    color mechanic IS ported: a set color pair grades the card's own
 *    border to `color[1]` at the 0.5 hairline (SquarePalCard.tsx cardStyle).
 *  - The badge's shadow is a 1px hairline instead: global.css bans
 *    box-shadow everywhere ("depth is a 1px hairline or one step between
 *    the surfaces").
 *  - The badge glyph pair is lucide (Camera / MessageSquareText) per the
 *    UI rule, at the reference's 18px size.
 *  - The letter fallback is "C", not the reference's "P" — LiAI calls the
 *    thing a Companion; the letter mirrors the domain word.
 *  - The description falls back through the cleanSystemPrompt strip (exact
 *    reference port); the parameter-summary and capability-text steps are
 *    skipped — no video template and no UI-written parameters exist yet.
 *  - Readiness is ONE predicate — services/companions/activate.ts
 *    isModelReady (catalog member + `downloadStatus "completed"`). Here the
 *    pill and the badge's activation flow SHARE the rule instead of each
 *    re-deriving it, so they can never contradict each other.
 *  - The tapping surface is the editor; activation (bind + model check +
 *    Chat) lives on the badge, which is where the reference puts it too.
 */

import { Alert, Image, Pressable, Text, View } from "react-native";
import { AlertCircle, Camera, MessageSquareText, Share, Trash2 } from "lucide-react-native";

import { isModelReady } from "@/services/companions/activate.ts";
import { shareCompanions } from "@/services/companions/share-companions.ts";
import { useActivateCompanion } from "@/hooks/useActivateCompanion.ts";
import { useCompanions } from "@/store/companions.ts";
import { useModelStore } from "@/store/model-store.ts";
import { useColors } from "@/themes/tokens.ts";
import { getContrastColor } from "@/utils/contrast.ts";
import type { Companion } from "@/types/companion.ts";

/** Reference fallback when a companion carries no color pair
 *  (SquarePalCard's own gradientColors default). It paints the avatar for
 *  UNCOLORED companions — companion data, not a theme token. */
const AVATAR_FALLBACK = "#333333";

/** Reference cleanSystemPrompt: strip the "You are" preamble and the
 *  trailing technicalities so a prompt can double as display copy. */
function usablePrompt(systemPrompt: string | undefined): string {
  if (!systemPrompt) return "";
  let cleaned = systemPrompt
    .replace(/^You are\s+/i, "")
    .replace(/^You're\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  cleaned = cleaned.replace(
    /\.\s*(Use few words|Be concise|If unsure, say so clearly).*$/i,
    "",
  );
  return cleaned.trim();
}

export function CompanionCard({
  companion,
  onOpen,
}: {
  companion: Companion;
  /** Open the editor. */
  onOpen: () => void;
}) {
  const colors = useColors();
  const deleteCompanion = useCompanions((s) => s.deleteCompanion);
  const models = useModelStore((s) => s.models);

  const activateCompanion = useActivateCompanion();

  const avatarColor = companion.color?.[0] ?? AVATAR_FALLBACK;
  const textColor = getContrastColor(avatarColor);
  const firstLetter = (companion.name?.[0] ?? "C").toUpperCase();
  const displayContent =
    companion.description ?? (usablePrompt(companion.systemPrompt) || undefined);

  // The pill reads the shared readiness rule (services/companions/
  // activate.ts isModelReady), so it can never disagree with what the
  // avatar badge's activation flow resolves.
  const showModelWarning =
    companion.defaultModel !== undefined &&
    !isModelReady(companion.defaultModel.id, models);

  function confirmDelete(): void {
    Alert.alert(
      "Delete Companion",
      `Delete "${companion.name}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => void deleteCompanion(companion.id),
        },
      ],
    );
  }

  async function share(): Promise<void> {
    try {
      await shareCompanions([companion]);
    } catch {
      Alert.alert("Share Error", "Failed to share companion. Please try again.", [
        { text: "OK" },
      ]);
    }
  }

  return (
    <Pressable
      onPress={onOpen}
      testID={`companion-card-${companion.id}`}
      className={`flex-1 overflow-hidden rounded-2xl border bg-surface-1 ${
        companion.color ? "" : "border-border"
      }`}
      // A colored companion grades the card border to its second color at
      // the reference's 0.5 width; an uncolored one keeps the token
      // hairline (SquarePalCard.tsx cardStyle).
      style={
        companion.color
          ? { borderWidth: 0.5, borderColor: companion.color[1] }
          : undefined
      }
      accessibilityRole="button"
      accessibilityLabel={`Edit companion ${companion.name}`}
    >
      <View className="p-3">
        <View
          className="relative h-20 items-center justify-center rounded-xl"
          style={{ backgroundColor: avatarColor }}
        >
          {companion.thumbnail_url ? (
            <Image
              source={{ uri: companion.thumbnail_url }}
              className="h-full w-full rounded-xl"
              resizeMode="cover"
            />
          ) : (
            <Text
              maxFontSizeMultiplier={1.5}
              className="font-sans-semibold text-h2"
              style={{ color: textColor }}
            >
              {firstLetter}
            </Text>
          )}
          <Pressable
            onPress={() => void activateCompanion(companion)}
            className="absolute right-1.5 bottom-1.5 h-7 w-7 items-center justify-center rounded-full border border-border bg-surface-1 active:opacity-80"
            accessibilityRole="button"
            accessibilityLabel={`Use ${companion.name} in chat`}
            hitSlop={4}
          >
            {companion.capabilities?.video ? (
              <Camera size={18} color={colors.primary} />
            ) : (
              <MessageSquareText size={18} color={colors.primary} />
            )}
          </Pressable>
        </View>

        <View className="mt-1.5 min-h-9 flex-row items-center gap-2">
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={1.5}
            className="flex-1 font-sans-semibold text-body-md text-primary-text"
          >
            {companion.name || "Untitled"}
          </Text>
          <Pressable
            onPress={() => void share()}
            className="icon-btn h-6 w-6"
            accessibilityRole="button"
            accessibilityLabel={`Share ${companion.name}`}
            hitSlop={4}
          >
            <Share size={16} color={colors.primaryText} />
          </Pressable>
          <Pressable
            onPress={confirmDelete}
            className="icon-btn h-6 w-6"
            accessibilityRole="button"
            accessibilityLabel={`Delete ${companion.name}`}
            hitSlop={4}
          >
            <Trash2 size={16} color={colors.errorMark} />
          </Pressable>
        </View>

        {displayContent ? (
          <Text
            numberOfLines={showModelWarning ? 1 : 2}
            maxFontSizeMultiplier={1.5}
            className="text-body-sm text-secondary-text"
          >
            {displayContent}
          </Text>
        ) : null}

        {showModelWarning ? (
          <View className="mt-1 flex-row items-center gap-1 self-start rounded-md border border-error/40 bg-error/10 px-1.5 py-1">
            <AlertCircle size={14} color={colors.errorMark} />
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={2}
              className="flex-shrink text-micro text-error"
            >
              Model not downloaded
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
