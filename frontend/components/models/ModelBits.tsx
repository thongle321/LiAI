/** Shared models bits: formats, chips, status, progress, download button. */

import { Pressable, Text, View } from "react-native";
import { Download, Pause, Play } from "lucide-react-native";

import { colors } from "../../themes/tokens.ts";
import type {
  HFModelFile,
  ModelDownloadStatus,
  PresetModelFile,
} from "../../types/models";

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export function formatProgress(downloaded: number, total: number): string {
  return `${formatBytes(downloaded)} / ${formatBytes(total)}`;
}

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

export function Chip({ label }: { label: string }) {
  return (
    <View className="px-1.5 py-0.5 bg-surface-2 border border-border rounded">
      <Text className="font-sans text-xs text-secondary-text">{label}</Text>
    </View>
  );
}

export function StatusDot({ color }: { color: string }) {
  return <View className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />;
}

export function StatusBadge({ status }: { status: ModelDownloadStatus }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <StatusDot color={STATUS_DOT_COLOR[status]} />
      <Text className="font-sans text-body-sm text-secondary-text">
        {STATUS_LABEL[status]}
      </Text>
    </View>
  );
}

export function DownloadProgressBar({
  progress,
  downloaded,
  total,
}: {
  progress: number;
  downloaded: number;
  total: number;
}) {
  return (
    <View className="mt-2">
      <View className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
        <View
          className="h-full bg-primary rounded-full"
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </View>
      <Text className="font-sans text-body-sm text-secondary-text/70 mt-1">
        {formatProgress(downloaded, total)} ({Math.round(progress)}%)
      </Text>
    </View>
  );
}

export function DownloadButton({
  file,
  status,
  progress,
  onPress,
  disabled = false,
}: {
  file: PresetModelFile | HFModelFile;
  status: string;
  progress: number;
  onPress: () => void;
  disabled?: boolean;
}) {
  const isDownloading = status === "downloading";
  const isPaused = status === "paused";
  const isCompleted = status === "completed";

  if (isCompleted) {
    return (
      <Pressable
        onPress={onPress}
        className="flex-row items-center px-3 py-2 bg-green-500/20 border border-green-500/50 rounded-lg"
      >
        <Download size={16} color={colors.primary} />
        <Text className="ml-2 font-sans text-body-sm text-green-500">Downloaded</Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className="flex-row items-center px-3 py-2 bg-surface-2 border border-border rounded-lg"
    >
      {isDownloading ? (
        <Pause size={16} color={colors.primary} />
      ) : isPaused ? (
        <Play size={16} color={colors.primary} />
      ) : (
        <Download size={16} color={colors.primary} />
      )}
      <Text className="ml-2 font-sans text-body-sm text-primary-text">
        {isDownloading
          ? `${Math.round(progress)}%`
          : isPaused
          ? "Paused"
          : "Download"}
      </Text>
    </Pressable>
  );
}
