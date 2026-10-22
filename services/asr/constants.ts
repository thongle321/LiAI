// Ported verbatim from pocketpal-ai/src/services/asr/constants.ts
import type { AsrTier, AsrTierManifest } from "./types.ts";

export const ASR_DEVICE_TIERS = ["high", "flagship"] as const;

export const ASR_ANDROID_RAM_SHARE = 0.45;
export const ASR_IOS_CEILING_SHARE = 0.8;
export const ASR_MAX_RECORD_MS = 180_000;
export const ASR_NO_AUDIO_MS = 3_000;
export const ASR_RECORD_WARNING_MS = 10_000;
export const ASR_SEGMENT_PAUSE_MS = 700;
export const ASR_MIN_SEGMENT_MS = 15_000;
export const ASR_MAX_SEGMENT_MS = 25_000;
export const ASR_SEGMENT_LEAD_IN_MS = 300;
export const ASR_PROMPT_CHARS = 200;
export const ASR_CHUNK_BYTES = 1600;
export const ASR_LEVEL_CHUNKS = 2;
export const ASR_LEVEL_HISTORY = 40;
export const ASR_SAMPLE_RATE = 16_000;
export const ASR_CHANNELS = 1;
export const ASR_BITS_PER_SAMPLE = 16;
export const ASR_VAD_RMS_FLOOR = 0.01;
export const ASR_VAD_FRAME_MS = 30;
export const ASR_MIN_SPEECH_MS = 300;
export const ASR_PARENT_SUBDIR = "asr";
export const ASR_MODEL_VERSION = 1;
export const ASR_VERSION_SENTINEL_FILENAME = "model-version.json";
export const ASR_INSUFFICIENT_STORAGE = "asr::insufficient-storage";
export const ASR_DISK_HEADROOM_FACTOR = 1.2;

const WHISPER_CPP_BASE_URL =
  "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";

export const ASR_TIERS: Record<AsrTier, AsrTierManifest> = {
  base: {
    tier: "base",
    modelFilename: "ggml-base-q5_1.bin",
    modelUrl: `${WHISPER_CPP_BASE_URL}/ggml-base-q5_1.bin`,
    estimatedBytes: 59_707_625,
    runtimeBytes: 330_000_000,
  },
  small: {
    tier: "small",
    modelFilename: "ggml-small-q8_0.bin",
    modelUrl: `${WHISPER_CPP_BASE_URL}/ggml-small-q8_0.bin`,
    estimatedBytes: 264_464_607,
    runtimeBytes: 650_000_000,
  },
  "large-turbo": {
    tier: "large-turbo",
    modelFilename: "ggml-large-v3-turbo-q5_0.bin",
    modelUrl: `${WHISPER_CPP_BASE_URL}/ggml-large-v3-turbo-q5_0.bin`,
    estimatedBytes: 574_041_195,
    runtimeBytes: 1_200_000_000,
  },
};

export const ASR_DEFAULT_TIER: AsrTier = "small";
export const ASR_TIER_ORDER: AsrTier[] = ["base", "small", "large-turbo"];
