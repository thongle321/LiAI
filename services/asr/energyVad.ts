import {
  ASR_MIN_SPEECH_MS,
  ASR_SAMPLE_RATE,
  ASR_VAD_FRAME_MS,
  ASR_VAD_RMS_FLOOR,
} from "./constants.ts";
import type { VadResult } from "./types.ts";

export function energyVad(samples: Float32Array): VadResult {
  const durationMs = (samples.length / ASR_SAMPLE_RATE) * 1000;

  if (samples.length === 0) {
    return { passed: false, rms: 0, voicedMs: 0, durationMs: 0 };
  }

  const frameSize = Math.round((ASR_SAMPLE_RATE * ASR_VAD_FRAME_MS) / 1000);
  let sumSquares = 0;
  let voicedFrames = 0;
  for (let start = 0; start < samples.length; start += frameSize) {
    const end = Math.min(start + frameSize, samples.length);
    let frameSquares = 0;
    for (let i = start; i < end; i++) {
      const s = samples[i]!;
      frameSquares += s * s;
    }
    sumSquares += frameSquares;
    if (
      end - start === frameSize &&
      Math.sqrt(frameSquares / frameSize) >= ASR_VAD_RMS_FLOOR
    ) {
      voicedFrames++;
    }
  }
  const rms = Math.sqrt(sumSquares / samples.length);
  const voicedMs = voicedFrames * ASR_VAD_FRAME_MS;

  return { passed: voicedMs >= ASR_MIN_SPEECH_MS, rms, voicedMs, durationMs };
}

export function int16PcmToFloat32(pcm: Uint8Array): Float32Array {
  const sampleCount = Math.floor(pcm.length / 2);
  const out = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const lo = pcm[i * 2]!;
    const hi = pcm[i * 2 + 1]!;
    let val = (hi << 8) | lo;
    if (val >= 0x8000) {
      val -= 0x10000;
    }
    out[i] = val < 0 ? val / 0x8000 : val / 0x7fff;
  }
  return out;
}

const LEVEL_FLOOR_DB = -60;
const LEVEL_CEIL_DB = -10;

export function inputLevel(samples: Float32Array): number {
  if (samples.length === 0) {
    return 0;
  }
  let sumSquares = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    sumSquares += s * s;
  }
  const rms = Math.sqrt(sumSquares / samples.length);
  if (rms === 0) {
    return 0;
  }
  const db = 20 * Math.log10(rms);
  const level = (db - LEVEL_FLOOR_DB) / (LEVEL_CEIL_DB - LEVEL_FLOOR_DB);
  return Math.min(1, Math.max(0, level));
}
