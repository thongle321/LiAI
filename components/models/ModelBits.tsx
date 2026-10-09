/** Shared models bits: formats, chips, status, progress, download button. */

import { Pressable, Text, View } from "react-native";
import { CheckCircle2, Download, Eye, MessageSquare, Pause, Play, X } from "lucide-react-native";

import { colors } from "../../themes/tokens.ts";
import { clampPercent, formatBytes, progressCaption } from "../../lib/models/progress.ts";
import type { ModelDownloadStatus, ModelType } from "../../types/models";

// Re-exported so the six existing importers keep one import path. The
// implementation lives in lib/ now, where it is testable by `node --test`
// and where the PocketParity port is documented.
export { formatBytes, progressCaption };

/** Compact stat for HF rows (e.g. 12.4k downloads). */
export function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

const STATUS_DOT_COLOR: Record<ModelDownloadStatus, string> = {
  completed: colors.success,
  downloading: colors.primary,
  paused: colors.warning,
  failed: colors.error,
  cancelled: colors.secondaryText,
  idle: colors.secondaryText,
};

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
      <Text className="font-sans text-caption text-secondary-text">{label}</Text>
    </View>
  );
}

export function StatusDot({ color }: { color: string }) {
  return <View className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />;
}

/** Leading model-type icon (PocketPal ModelCard.getModelTypeIcon parity):
 * eye for vision models, chat bubble for text. 16px before the name. */
export function ModelTypeIcon({ type }: { type: ModelType }) {
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
  return (
    <View className="flex-row items-center gap-2">
      <StatusDot color={STATUS_DOT_COLOR[status]} />
      <Text className="font-sans text-body-sm text-secondary-text">
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
    <View className="h-2 overflow-hidden rounded-[5px] bg-surface-2">
      <View className="h-full rounded-[5px] bg-primary" style={{ width: `${clamped}%` }} />
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
      <Text className="mt-1 text-right font-sans text-caption text-secondary-text">
        {progressCaption(downloaded, total, speed ?? 0)}
      </Text>
    </View>
  );
}

/** Abandon a download. Sits beside DownloadButton and matches its shape
 * (48dp, 8px radius, 1px Hairline) so the pair reads as one control
 * cluster. Labelled rather than an icon alone: it deletes the partial
 * file, and a bare X does not say that. */
export function CancelDownloadButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="min-h-12 flex-row items-center justify-center rounded-lg border border-border bg-surface-1 px-3 py-2"
      accessibilityRole="button"
      accessibilityLabel="Cancel download and delete downloaded data"
    >
      <X size={16} color={colors.error} />
      <Text className="ml-2 font-sans text-body-sm text-primary-text">Cancel</Text>
    </Pressable>
  );
}

export function DownloadButton({
  status,
  progress,
  onPress,
  onPause,
  onResume,
  disabled = false,
}: {
  status: string;
  progress: number;
  onPress: () => void;
  /** Pause/resume taps; fall back to onPress when absent. */
  onPause?: () => void;
  onResume?: () => void;
  disabled?: boolean;
}) {
  const isDownloading = status === "downloading";
  const isPaused = status === "paused";
  const isCompleted = status === "completed";
  const isFailed = status === "failed";
  const label = isDownloading
    ? `${Math.round(progress)}%`
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
        <CheckCircle2 size={16} color={colors.success} />
        <Text className="ml-2 font-sans text-body-sm text-secondary-text">Downloaded</Text>
      </View>
    );
  }

  return (
    <Pressable
      onPress={isDownloading ? onPause ?? onPress : isPaused ? onResume ?? onPress : onPress}
      disabled={disabled}
      className="min-h-12 items-center justify-center rounded-lg border border-border bg-surface-1 px-3 py-2"
      accessibilityRole="button"
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
        {isDownloading ? (
          <Pause size={16} color={colors.primary} />
        ) : isPaused ? (
          <Play size={16} color={colors.primary} />
        ) : (
          <Download size={16} color={colors.primary} />
        )}
        <Text className="font-sans text-body-sm text-primary-text">{label}</Text>
      </View>
    </Pressable>
  );
}
