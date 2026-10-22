export type AsrTier = "base" | "small" | "large-turbo";

export type AsrDownloadState =
  | "not_installed"
  | "downloading"
  | "ready"
  | "error";

export type CaptureState =
  | "idle"
  | "requesting_perm"
  | "recording"
  | "transcribing"
  | "error";

export type AsrErrorKind =
  | "permission_denied"
  | "permission_blocked"
  | "transcribe_failed"
  | "not_installed"
  | "insufficient_memory"
  | "mic_unavailable"
  | "transcript_partial";

export interface AsrTierManifest {
  tier: AsrTier;
  modelFilename: string;
  modelUrl: string;
  estimatedBytes: number;
  runtimeBytes: number;
}

export interface AsrTranscript {
  text: string;
  language: string;
}

export type AsrProgressCallback = (progress: number) => void;

export interface VadResult {
  passed: boolean;
  rms: number;
  voicedMs: number;
  durationMs: number;
}

export interface AsrEngine {
  isInstalled(tier: AsrTier): Promise<boolean>;
  downloadModel(tier: AsrTier, onProgress?: AsrProgressCallback): Promise<void>;
  deleteModel(tier: AsrTier): Promise<void>;
  reclaimLegacySpace(tier: AsrTier): Promise<void>;
  transcribe(
    pcmBase64Int16: string,
    opts?: { tier: AsrTier; language?: string; prompt?: string },
  ): Promise<AsrTranscript>;
  cancelTranscription(): Promise<void>;
  release(): Promise<void>;
}
