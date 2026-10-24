/** Whether the chat model, the selected whisper tier and the voice can be
 *  resident together, with the per-model breakdown the memory sheet shows.
 *
 *  Ported from pocketpal-ai src/services/asr/whisperFits.ts +
 *  src/services/voice/memoryFit.ts. One divergence, recorded in the
 *  research note: LiAI has no per-model iOS free-before-load ceiling, so
 *  both platforms budget against readTotalMemory() × that platform's share
 *  (identical arithmetic to LiAI's existing dictation gate in
 *  services/asr/availability.ts). And the tts row is optional: LiAI has no
 *  MEASURED engine RAM (services/tts/engineMeta.ts refuses invented
 *  figures), so `ttsBytes` arrives as 0 until one is measured, and a 0 row
 *  is simply not part of the breakdown.
 */

import { ASR_ANDROID_RAM_SHARE, ASR_IOS_CEILING_SHARE, ASR_TIERS } from "@/services/asr/constants.ts";
import type { AsrTier } from "@/services/asr/types.ts";

/**
 * The memory figure the budget counts against. Android budgets against
 * total RAM (its free-memory figure is unreliable: PocketPal #982); iOS
 * budgets against total RAM × its share on this stack.
 */
export type DeviceMemory =
  | { os: "ios"; totalBytes: number | null }
  | { os: "android"; totalBytes: number | null };

/** The bytes the chat model and the speech models may use together. */
export const memoryBudget = (memory: DeviceMemory): number => {
  if (memory.totalBytes === null) return 0;
  return (
    memory.totalBytes *
    (memory.os === "ios" ? ASR_IOS_CEILING_SHARE : ASR_ANDROID_RAM_SHARE)
  );
};

/** Whether whisper fits next to the loaded chat model; unknown memory fits. */
export const whisperFits = (
  memory: DeviceMemory,
  chatBytes: number,
  whisperBytes: number,
): boolean =>
  memory.totalBytes === null ||
  chatBytes + whisperBytes <= memoryBudget(memory);

export interface VoiceMemoryInputs {
  /** null totalBytes = the reading failed; the fit defers to that. */
  memory: DeviceMemory | null;
  chatBytes: number;
  sttTier: AsrTier;
  /** 0 until an engine's RAM is measured: the row is then omitted. */
  ttsBytes: number;
}

export type MemoryRowKind = "chat" | "stt" | "tts";

/** One resident model's share of `neededBytes`. */
export interface VoiceMemoryRow {
  kind: MemoryRowKind;
  bytes: number;
}

export type MemoryFitStatus = "fits" | "tight" | "wont_fit";

export interface VoiceMemoryFit {
  status: MemoryFitStatus;
  /** The whisper tier whose runtime bytes the stt row counts. */
  sttTier: AsrTier;
  breakdown: {
    /** Sums to `neededBytes`. */
    rows: VoiceMemoryRow[];
    neededBytes: number;
    availableBytes: number;
  };
}

export const voiceMemoryFit = ({
  memory,
  chatBytes,
  sttTier,
  ttsBytes,
}: VoiceMemoryInputs): VoiceMemoryFit => {
  if (memory === null || memory.totalBytes === null) {
    return {
      status: "fits",
      sttTier,
      breakdown: { rows: [], neededBytes: 0, availableBytes: 0 },
    };
  }
  const sttBytes = ASR_TIERS[sttTier].runtimeBytes;
  const rows: VoiceMemoryRow[] = [
    { kind: "chat", bytes: chatBytes },
    { kind: "stt", bytes: sttBytes },
    ...(ttsBytes > 0 ? [{ kind: "tts" as const, bytes: ttsBytes }] : []),
  ];
  const availableBytes = memoryBudget(memory);
  const neededBytes = rows.reduce((sum, row) => sum + row.bytes, 0);
  let status: MemoryFitStatus = "fits";
  if (!whisperFits(memory, chatBytes, sttBytes)) {
    status = "wont_fit";
  } else if (neededBytes > availableBytes) {
    status = "tight";
  }
  return { status, sttTier, breakdown: { rows, neededBytes, availableBytes } };
};
