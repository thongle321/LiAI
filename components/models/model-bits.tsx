/** Shared models bits: formats, chips, status, progress, download button. */

import { Alert, Pressable, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { CheckCircle2, CircleOff, Download, Eye, MessageSquare, Pause, Play, X } from "lucide-react-native";

import { useColors, type Colors } from "@/themes/tokens.ts";
import { clampPercent, formatBytes, progressCaption } from "@/services/models/progress.ts";
import type { ModelDownloadStatus, ModelType } from "@/types/models";

// Re-exported so the six existing importers keep one import path. The
// implementation lives in services/models/ now, where it is testable by `jest`
// and where the PocketParity port is documented.
export { formatBytes, progressCaption };

/** Compact stat for HF rows (e.g. 12.4k downloads). */
export function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

/** The dot colour per status, resolved against the ACTIVE palette so a
 * theme switch recolours the badge (was a module-scope light snapshot). */
function statusDotColor(palette: Colors): Record<ModelDownloadStatus, string> {
  return {
    completed: palette.success,
    downloading: palette.primary,
    paused: palette.warning,
    failed: palette.error,
    cancelled: palette.secondaryText,
    idle: palette.secondaryText,
  };
}

const STATUS_LABEL: Record<ModelDownloadStatus, string> = {
  completed: "Downloaded",
  downloading: "Downloading",
  paused: "Paused",
  failed: "Failed",
  cancelled: "Cancelled",
  idle: "Not downloaded",
};

export function isProgressVisible(status: ModelDownloadStatus): boolean {
  return status === "downloading" || status === "paused";
}

/** Inactive chip: Mist fill (the recessed plane), Small radius, no border.
 * A chip sits inside a card, so it is recessed, never raised. */
export function Chip({ label }: { label: string }) {
  return (
    <View className="rounded bg-surface-2 px-2 py-0.5">
      <Text className="text-quiet">{label}</Text>
    </View>
  );
}

export function StatusDot({ color }: { color: string }) {
  return <View className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />;
}

/** Leading model-type icon (PocketPal ModelCard.getModelTypeIcon parity):
 * eye for vision models, chat bubble for text. 16px before the name. */
export function ModelTypeIcon({ type }: { type: ModelType }) {
  const colors = useColors();
  const vision = type === "vision";
  const Icon = vision ? Eye : MessageSquare;
  return (
    <Icon
      size={16}
      color={vision ? colors.primary : colors.secondaryText}
    />
  );
}

export function StatusBadge({ status }: { status: ModelDownloadStatus }) {
  const colors = useColors();
  return (
    <View className="flex-row items-center gap-2">
      <StatusDot color={statusDotColor(colors)[status]} />
      <Text className="text-quiet">
        {STATUS_LABEL[status]}
      </Text>
    </View>
  );
}

/** The bar itself: track plus fill. The clamp is shared so every surface
 *  showing a transfer cannot drift from the others. 8px tall with a 5px
 *  radius, the reference app's proportions. */
export function ProgressTrack({ progress }: { progress: number }) {
  const clamped = clampPercent(progress);
  return (
    <View className="h-2 overflow-hidden rounded bg-surface-2">
      <View className="h-full rounded bg-primary" style={{ width: `${clamped}%` }} />
    </View>
  );
}

export function DownloadProgressBar({
  progress,
  downloaded,
  total,
  speed,
}: {
  progress: number;
  /** Bytes on disk right now, and the transfer's full size. */
  downloaded: number;
  total: number;
  /** Live bytes/sec. */
  speed?: number;
}) {
  // Mist track, Signal Blue fill, 5px radius on both. The caption is
  // Caption Slate, right-aligned: it counts bytes, so it is metadata.
  return (
    <View className="mx-0.5 mb-3 mt-1">
      <ProgressTrack progress={progress} />
      <Text className="mt-1 text-right text-quiet">
        {progressCaption(downloaded, total, speed ?? 0)}
      </Text>
    </View>
  );
}

/** Abandon a download. PocketPal's shape (ModelCard.tsx:435-449): an
 * outlined, full-width destructive button sitting UNDER the progress bar,
 * error-tinted ground, error label, close icon. Ours carries the same
 * geometry in LiAI's own tokens — Error border and label, Clean White
 * ground, 48dp tall, 8px radius. Labelled rather than an icon alone: it
 * deletes the partial file, and a bare X does not say that. */
export function CancelDownloadButton({ onPress }: { onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      className="mt-1 min-h-12 w-full flex-row items-center justify-center rounded-lg border border-error bg-surface-1 px-3 py-2"
      accessibilityRole="button"
      accessibilityLabel="Cancel download and delete downloaded data"
    >
      <X size={16} color={colors.error} />
      <Text className="ml-2 font-sans text-body-sm text-error">Cancel</Text>
    </Pressable>
  );
}

/** The one delete confirmation in the app. Two surfaces destroy a
 *  downloaded file — the models-screen card and the HF file row — and both
 *  must say the same thing, so the wording lives here rather than in each.
 *
 *  This is the CONFIRM only. It deliberately does not give DownloadButton a
 *  delete mode: its completed branch is an inert state for the card, and
 *  the HF row draws its own control instead. */
export function confirmDeleteModel(onConfirm: () => void): void {
  Alert.alert(
    "Delete Model",
    "Are you sure you want to delete this downloaded model?",
    [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onConfirm(); } },
    ],
  );
}

/** The one remove-from-list confirmation in the app. Three surfaces drop
 *  a model from the list without touching disk — the preset card's X, the
 *  bookmark card's X and the HF file row — and all must say the same
 *  thing, so the wording lives here (PocketParity: pocketpal shares its
 *  removeTitle/removeMessage across its card and file row the same way). */
export function confirmRemoveModel(onConfirm: () => void): void {
  Alert.alert(
    "Remove Model",
    "Are you sure you want to remove this model from the list?",
    [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onConfirm(); } },
    ],
  );
}

export function DownloadButton({
  status,
  progress,
  onPress,
  onPause,
  onResume,
  disabled = false,
  iconOnly = false,
}: {
  status: string;
  progress: number;
  onPress: () => void;
  /** Pause/resume taps; fall back to onPress when absent. */
  onPause?: () => void;
  onResume?: () => void;
  disabled?: boolean;
  /** PocketParity (ModelFileCard.tsx:397-414): an icon-only IconButton.
   *  Same states and labels; the completed branch is never reached —
   *  callers that go icon-only hide the control on completion themselves. */
  iconOnly?: boolean;
}) {
  const colors = useColors();
  const isDownloading = status === "downloading";
  const isPaused = status === "paused";
  const isCompleted = status === "completed";
  const isFailed = status === "failed";
  // The button names the ACTION; the number belongs to the progress bar
  // already sitting next to it (DownloadProgressBar), and "42%" on a
  // pause button read as a value, not something to tap.
  const label = isDownloading
    ? "Pause"
    : isPaused
    ? "Paused"
    : isFailed
    ? "Retry"
    : "Download";
  // Completed is a state, not an action: Mist fill with a Jade check, and
  // the row is inert. Every other state is a real button — 48dp tall, 8px
  // radius, 1px Hairline, Ink label.
  if (isCompleted) {
    return (
      <View className="flex-row items-center rounded-lg bg-surface-2 px-3 py-2">
        <CheckCircle2 size={16} color={colors.successMark} />
        {iconOnly ? null : <Text className="ml-2 text-quiet">Downloaded</Text>}
      </View>
    );
  }

  if (iconOnly) {
    // The glyph speaks the state in coloured ink: the active action in ink,
    // grayed ink when it cannot happen — a full disk renders a prohibition
    // glyph instead of a frozen Download one, so the reason is visible
    // without a tooltip. PocketParity uses Material's download-off-outline
    // (ModelFileCard.tsx:239-243); lucide ships no such glyph, so the
    // closest is CircleOff.
    return (
      <Pressable
        onPress={isDownloading ? onPause ?? onPress : isPaused ? onResume ?? onPress : onPress}
        disabled={disabled}
        className="icon-btn"
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        accessibilityLabel={
          isDownloading
            ? `Pause download, ${Math.round(progress)} percent`
            : isPaused
            ? "Resume download"
            : isFailed
            ? "Retry download"
            : "Download model"
        }
      >
        {disabled ? (
          <CircleOff size={20} color={colors.secondaryText} />
        ) : isDownloading ? (
          <Pause size={20} color={colors.primary} />
        ) : isPaused ? (
          <Play size={20} color={colors.primary} />
        ) : (
          <Download size={20} color={colors.primary} />
        )}
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={isDownloading ? onPause ?? onPress : isPaused ? onResume ?? onPress : onPress}
      disabled={disabled}
      // Disabled is a FILL and LABEL change, never opacity (DESIGN.md): a
      // button that looks live and does nothing is worse than no button,
      // because the only way to find out is to tap it and be ignored.
      className={
        disabled
          ? "min-h-12 items-center justify-center rounded-lg border border-border bg-surface-2 px-3 py-2"
          : // PocketPal's btnDownload trio (#ecfdf5 ground / #bbf7d0 border /
            // #047857 label), carried by LiAI's own three green tokens. Its
            // border value is 1.21:1 and could never clear the non-text floor
            // here, so the border takes the 3:1 mark step instead.
            "min-h-12 items-center justify-center rounded-lg border border-success-mark bg-success-fill px-3 py-2"
      }
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={
        isDownloading
          ? `Pause download, ${Math.round(progress)} percent`
          : isPaused
          ? "Resume download"
          : isFailed
          ? "Retry download"
          : "Download model"
      }
    >
      <View className="flex-row items-center gap-2">
        {/* The glyph takes the MARK step and the label the text step —
            DESIGN.md's Two-Step Rule names icons as mark work. The label
            alone carries the 4.5:1. */}
        {isDownloading ? (
          <Pause size={16} color={disabled ? colors.secondaryText : colors.successMark} />
        ) : isPaused ? (
          <Play size={16} color={disabled ? colors.secondaryText : colors.successMark} />
        ) : (
          <Download size={16} color={disabled ? colors.secondaryText : colors.successMark} />
        )}
        <Text
          className={
            disabled
              ? "text-quiet"
              : "font-sans text-body-sm text-success-deep"
          }
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
