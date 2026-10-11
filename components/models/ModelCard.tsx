/** Ready-model rows: a downloaded local/HF/preset card and a remote-provider
 * row.
 *
 * PocketParity: pocketpal-ai/src/screens/ModelsScreen/ModelCard/ModelCard.tsx
 * (:688-818 and styles.ts). The anatomy is the reference's, verbatim: a
 * compact header (type icon, middle-elided name, the Cpu+size cluster and a
 * status dot) followed by ONE content container that owns the horizontal
 * padding and holds the warnings, the progress bar, ONE action row and —
 * when open — the expanded details. The header's author line and the
 * type/size/file-count chips are gone: the reference carries none of them,
 * and the author is in the expanded grid instead (:962-971).
 *
 * The SKIN is this app's (DESIGN.md wins every token), so the reference's
 * 24px card radius and 40px button heights are replaced by the Default 8px
 * step and the 48dp floor; see docs/research's card parity record for the
 * full copied/diverged list.
 *
 * The row itself is decided by lib/models/card-actions.ts (one pure
 * function, tested); this file draws what it returns.
 */

import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import {
  ChevronsDownUp,
  ChevronsUpDown,
  Cpu,
  Eject,
  Play,
  Settings,
  Trash2,
  X,
} from "lucide-react-native";

import { colors } from "../../themes/tokens.ts";
import { useModelStore } from "../../store/modelStore";
import { useStorageDisclosure } from "../../hooks/useStorageDisclosure.ts";
import { parseModelSettings } from "../../lib/model-settings.ts";
import { cardActions, statusDotState } from "../../lib/models/card-actions.ts";
import {
  MOTION_DURATION_MS,
  fadeEntering,
  fadeExiting,
} from "../../lib/motion.ts";
import type { ModelSpec, RemoteApiProvider } from "../../types/models";
import {
  Chip,
  CancelDownloadButton,
  DownloadButton,
  DownloadProgressBar,
  ModelTypeIcon,
  StatusDot,
  formatBytes,
} from "./ModelBits.tsx";
import { ModelCardDetails } from "./ModelCardDetails.tsx";

/** PocketPal's card geometry: 8px radius (DESIGN.md's Default step),
 *  1px outline, no elevation (styles.ts:7-14). The 24px radius this card
 *  used to carry was PocketPal's value, taken wholesale over the design
 *  system's — retired 2026-10-10, see docs/research's card parity record.
 *  The list owns the gutter; the card owns only its own `mb-3`. */
const CARD =
  "mb-3 overflow-hidden rounded-lg border border-border bg-surface-1";
/** The 16px leading icon inside a 48px target. DESIGN.md l.377: "the visual
 *  circle is 40px; the touch target is 48×48dp minimum. Pad the hit area, not
 *  the circle" — so the icon sits directly in the pressable and there is no
 *  wrapper box around it. PocketPal's `styles.iconButton` is exactly this
 *  (40px, radius 16, transparent); ours keeps the legal target. */
const ICON_BUTTON = "h-12 w-12 items-center justify-center";
/** Destructive only: Alert Tint is DESIGN.md l.238's documented fill for
 *  destructive icon buttons, so the trash keeps a ground while settings and
 *  expand stay bare. */
const ICON_DESTRUCTIVE = "rounded-full bg-error/10";

export function ModelCard({
  item,
  isActive,
  onActivate,
  onDeactivate,
  onSettings,
  onDownload,
}: {
  item: ModelSpec;
  isActive: boolean;
  /** Load: point the engine at this model. */
  onActivate: () => void;
  /** Unload: free the engine so no model is active. */
  onDeactivate: () => void;
  onSettings: () => void;
  /** Present only on a bookmark: it has no file yet, so the card offers
   *  Download instead of Load/Unload. PocketParity with PocketPal's
   *  not-downloaded ModelCard branch. */
  onDownload?: () => void;
}) {
  // Stable selectors: actions never change identity, so each subscribes
  // alone and no card re-renders on unrelated store writes.
  const removeModel = useModelStore((s) => s.removeModel);
  const removeBookmark = useModelStore((s) => s.removeBookmark);
  // The card renders this model's display name: subscribe to the entry
  // itself (not the whole map) so a rename re-renders this card only.
  const settings = parseModelSettings(
    useModelStore((s) => s.modelSettings[item.id]),
  );
  const pauseModelDownload = useModelStore((s) => s.pauseModelDownload);
  const resumeModelDownload = useModelStore((s) => s.resumeModelDownload);
  const cancelModelDownload = useModelStore((s) => s.cancelModelDownload);
  const title = settings.displayName || item.name;
  // Only the file size, never the parameter count next to it: "0.6B" beside
  // "751 MB" reads as two competing sizes for one model.
  const fileBytes = item.files.reduce((sum, f) => sum + f.size, 0);
  // A ready model has no Download button, so it has nothing to check: null
  // stops the poll. A bookmark polls while it is on screen, which is what
  // lets the button come back on its own once space is freed.
  const fit = useStorageDisclosure(
    onDownload ? fileBytes : null,
    // The projector leg runs after this one, so a vision model's requirement
    // is the pair — matching the store's pre-flight. Without this a vision
    // bookmark looks like it fits when it does not.
    item.projector?.size,
  );
  // Detail expand: chevron state only — the region itself mounts with
  // the shared fade preset.
  const [expanded, setExpanded] = useState(false);
  const duration = MOTION_DURATION_MS;

  const actions = cardActions({
    status: item.downloadStatus,
    isActive,
    downloadable: onDownload !== undefined,
  });
  const dot = statusDotState({ status: item.downloadStatus, isActive });

  /** Both destructive actions confirm first (PocketParity: ModelCard.tsx
   *  :220-232 for delete, :247-257 for remove). The two wordings are the
   *  reference's, because the difference between them is the whole point:
   *  one deletes a file, the other only drops a list entry. */
  function confirmDestructive(): void {
    // Read the same thing the glyph and the a11y label read, so the three
    // cannot disagree about what the button does.
    const removing = actions.includes("remove");
    Alert.alert(
      removing ? "Remove Model" : "Delete Model",
      removing
        ? "Are you sure you want to remove this model from the list?"
        : "Are you sure you want to delete this downloaded model?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: removing ? "Remove" : "Delete",
          style: "destructive",
          onPress: () => {
            if (removing) {
              if (removeBookmark(item.id) === false) {
                Alert.alert("Error", "Failed to remove the model.");
              }
            } else {
              // removeModel is async and answers nothing, so there is no
              // result to report — only the delete can fail silently.
              void removeModel(item.id);
            }
          },
        },
      ],
    );
  }

  return (
    <View className={CARD}>
      {/* PocketPal's compact header (styles.ts:53-95): type icon + name on
          the left, the size cluster (Cpu chip + size, :86-99) then the
          status dot on the right. The dot reads "loaded" when green and
          "downloaded" when grey — never a word. */}
      <View className="flex-row items-center gap-2 px-4 py-3">
        <ModelTypeIcon type={item.type} />
        {/* flex-1/shrink so a long name truncates instead of pushing the
            dot past the card edge. middle-ellipsis keeps the informative
            end of an "org/model" repo name (pocketparity:
            ellipsizeMode="middle"). */}
        <Text
          numberOfLines={1}
          ellipsizeMode="middle"
          className="min-w-0 flex-1 font-sans-semibold text-body-md text-primary-text"
        >
          {title}
        </Text>
        {fileBytes > 0 ? (
          // PocketPal's sizeInfo: a 10px CpuChip before the size text. Ours
          // runs the glyph at 12px, the caption size it sits beside, because
          // a 10px icon is off this system's scale.
          <View className="flex-row items-center gap-1">
            <Cpu size={12} color={colors.secondaryText} />
            <Text className="font-sans text-caption text-secondary-text">
              {formatBytes(fileBytes)}
            </Text>
          </View>
        ) : null}
        {dot !== null ? (
          <View
            accessibilityRole="text"
            accessibilityLabel={dot === "active" ? "Loaded" : "Downloaded"}
          >
            <StatusDot
              color={dot === "active" ? colors.success : colors.secondaryText}
            />
          </View>
        ) : null}
      </View>

      {/* PocketPal's cardContent (styles.ts:19-23): ONE wrapper owns the
          horizontal padding, and the action row plus the expanded details
          live inside it rather than each carrying its own px. */}
      <View className="px-4 pb-3">
        {/* While a transfer is in flight the row IS the cancel (PocketParity:
            the downloading branch returns one wide Cancel, :426-453), with
            the progress bar above it — the global banner is gone, so this is
            the only progress readout a bookmark has. */}
        {actions[0] === "cancel" ? (
          <View className="mt-2">
            <DownloadProgressBar
              progress={item.downloadProgress}
              downloaded={item.downloadedBytes}
              total={item.totalBytes}
              speed={item.speedBytesPerSec}
            />
            <CancelDownloadButton
              onPress={() => void cancelModelDownload(item.id)}
            />
          </View>
        ) : null}

        {/* The shortfall, on the card: a disabled button with no reason is
            the failure this line exists to prevent. */}
        {onDownload && item.downloadStatus !== "completed" && fit.message ? (
          <Text className="storage-warning mt-2">{fit.message}</Text>
        ) : null}

        {/* One row (PocketParity: styles.ts:156-172 — gap 8, the primary
            action flex:1, the rest bare icon buttons). Wraps so a long name
            plus four actions reflow instead of clipping at 320pt. Nothing
            renders while a transfer is in flight: that row is the Cancel
            above, and an empty view here would only add phantom padding
            under it. */}
        {actions.length > 1 ? (
          <View className="mt-3 flex-row flex-wrap items-center gap-2">
            {actions.includes("download") && onDownload ? (
              <DownloadButton
                status={item.downloadStatus}
                progress={item.downloadProgress}
                onPress={onDownload}
                onPause={() => void pauseModelDownload(item.id)}
                onResume={() => void resumeModelDownload(item.id)}
                disabled={!fit.fits || item.downloadStatus === "completed"}
              />
            ) : null}

            {actions.includes("load") || actions.includes("offload") ? (
              <Pressable
                onPress={isActive ? onDeactivate : onActivate}
                className="btn btn--tonal flex-1"
                accessibilityRole="button"
                accessibilityLabel={isActive ? `Offload ${title}` : `Load ${title}`}
              >
                {/* PocketParity: the reference's glyph pair — a play circle
                    while the model is loadable, an eject once it is loaded
                    (ModelCard.tsx renderModelLoadButton). Its label is
                    already the state word, so the icon reinforces. */}
                {isActive ? (
                  <Eject size={16} color={colors.primary} />
                ) : (
                  <Play size={16} color={colors.primary} />
                )}
                <Text className="ml-2 font-sans text-body-sm text-primary">
                  {/* PocketParity: the loaded model's button says "Offload"
                        (en.json models.modelCard.buttons.offload) — the state word
                        is the label, and the glyph reinforces it. */}
                  {isActive ? "Offload" : "Load"}
                </Text>
              </Pressable>
            ) : null}

            {actions.includes("settings") ? (
              <Pressable
                onPress={onSettings}
                className={ICON_BUTTON}
                accessibilityRole="button"
                accessibilityLabel={`Settings for ${title}`}
              >
                <Settings size={16} color={colors.secondaryText} />
              </Pressable>
            ) : null}

            {/* A bookmark is removed with X, a downloaded file with trash:
                the glyph says whether anything on disk goes away. The only
                icon button that keeps a ground — Alert Tint is DESIGN.md's
                documented fill for destructive icon buttons. */}
            {actions.includes("remove") || actions.includes("delete") ? (
              <Pressable
                onPress={confirmDestructive}
                className={`${ICON_BUTTON} ${ICON_DESTRUCTIVE}`}
                accessibilityRole="button"
                accessibilityLabel={
                  actions.includes("remove") ? `Remove ${title}` : `Delete ${title}`
                }
              >
                {actions.includes("remove") ? (
                  <X size={16} color={colors.error} />
                ) : (
                  <Trash2 size={16} color={colors.error} />
                )}
              </Pressable>
            ) : null}

            {/* PocketPal's expand glyph pair: ChevronSelectorVertical when
                collapsed, ChevronSelectorExpandedVertical when open
                (ModelCard.tsx expand-details-button). The real icons rather
                than a rotation — a style-rotated lucide glyph rendered
                invisible on this phone once before. */}
            {actions.includes("expand") ? (
              <Pressable
                onPress={() => setExpanded((v) => !v)}
                className={ICON_BUTTON}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                accessibilityLabel={
                  expanded ? "Collapse details" : "Expand details"
                }
              >
                {expanded ? (
                  <ChevronsDownUp size={20} color={colors.secondaryText} />
                ) : (
                  <ChevronsUpDown size={20} color={colors.secondaryText} />
                )}
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* The details are a continuation of the card interior, not a second
            region: PocketPal's detailsContent has no divider either, and
            DESIGN.md separates with spacing and the card's own hairline. */}
        {expanded ? (
          <Animated.View
            entering={fadeEntering(duration)}
            exiting={fadeExiting(duration)}
            className="mt-3"
          >
            <ModelCardDetails item={item} fileBytes={fileBytes} />
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

export function RemoteProviderCard({
  item,
  isActive,
  reachable,
  onActivate,
  onRemove,
}: {
  item: RemoteApiProvider;
  isActive: boolean;
  reachable: boolean | undefined;
  onActivate: () => void;
  onRemove: () => void;
}) {
  // Same Default 8px step and hairline as every other card (DESIGN.md
  // "Default radius… buttons, inputs, cards"); the 24px this carried was
  // PocketPal's value, retired 2026-10-10.
  return (
    <View className="mb-3 overflow-hidden rounded-lg border border-border bg-surface-1">
      <View className="p-5 flex-row items-center justify-between">
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <StatusDot
              color={isActive ? colors.success : colors.secondaryText}
            />
            <Text className="font-sans-semibold text-body-md text-primary-text">
              {item.name}
            </Text>
          </View>
          <Text
            numberOfLines={2}
            ellipsizeMode="middle"
            className="font-sans text-body-sm text-secondary-text-muted mt-0.5"
          >
            {item.baseUrl} • {item.modelName}
          </Text>
          <View className="flex-row items-center gap-2 mt-2">
            <Chip
              label={
                item.providerType === "openrouter" ? "OpenRouter" : "Remote API"
              }
            />
            {!isActive && reachable === false && <Chip label="Unreachable" />}
          </View>
        </View>
        {!isActive && (
          <Pressable
            onPress={onActivate}
            className="btn btn--primary min-h-12 px-5 py-2"
            accessibilityRole="button"
            accessibilityLabel={`Activate ${item.name}`}
          >
            <Text className="font-sans text-body-sm text-on-primary">
              Activate
            </Text>
          </Pressable>
        )}
        <Pressable
          onPress={onRemove}
          className={`${ICON_BUTTON} ${ICON_DESTRUCTIVE}`}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${item.name}`}
        >
          <Trash2 size={16} color={colors.error} />
        </Pressable>
      </View>
    </View>
  );
}
