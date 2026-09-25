/** On-device inference settings: context, batch, threads, attention, cache,
 * speculative decoding, and memory flags.
 *
 * Values persist via the inference store and reach llama.rn on the next
 * reply (the engine slot reloads when params change). Same rows render on
 * both platforms — no hardware gating.
 */

import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";

import {
  CACHE_TYPES,
  MAX_BATCH,
  MAX_GPU_LAYERS,
  MAX_THREADS,
  MIN_CONTEXT,
  useInference,
  type CacheType,
  type FlashAttn,
} from "../store/inference.ts";
import { StepperRow, ToggleRow } from "./SettingsRows.tsx";

const CTX_STEP = 1024;
const CTX_MAX = 131072;
const BATCH_STEP = 128;
const FLASH_OPTIONS: FlashAttn[] = ["auto", "on", "off"];

function Segmented<T extends string>({
  label,
  hint,
  value,
  options,
  onPick,
}: {
  label: string;
  hint?: string;
  value: T;
  options: readonly T[];
  onPick: (v: T) => void;
}) {
  return (
    <View className="py-2.5">
      <Text className="font-sans text-body-md text-primary-text">{label}</Text>
      {hint && (
        <Text className="font-sans text-body-sm text-secondary-text mt-0.5">{hint}</Text>
      )}
      <View className="flex-row gap-2 mt-2">
        {options.map((o) => (
          <Pressable
            key={o}
            onPress={() => onPick(o)}
            className={`flex-1 py-2 rounded-lg border items-center ${
              o === value ? "bg-primary/20 border-primary/50" : "border-border"
            }`}
          >
            <Text
              className={`font-sans text-body-sm ${
                o === value ? "text-primary" : "text-secondary-text"
              }`}
            >
              {o}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function InferenceSettings() {
  const {
    nCtx,
    nGpuLayers,
    useMlock,
    useMmap,
    nBatch,
    nUbatch,
    nThreads,
    flashAttn,
    cacheK,
    cacheV,
    speculativeEnabled,
    specDraftGpuLayers,
    specDraftCacheK,
    specDraftCacheV,
    load,
    setNCtx,
    setNGpuLayers,
    setUseMlock,
    setUseMmap,
    setNBatch,
    setNUbatch,
    setNThreads,
    setFlashAttn,
    setCacheK,
    setCacheV,
    setSpeculativeEnabled,
    setSpecDraftGpuLayers,
    setSpecDraftCacheK,
    setSpecDraftCacheV,
  } = useInference();

  useEffect(() => {
    void load();
  }, []);

  return (
    <View className="mb-6">
      <Text className="font-sans-semibold text-h4 text-primary-text mb-1">On-device model</Text>
      <Text className="font-sans text-body-sm text-secondary-text mb-2">
        Takes effect on the next reply — the model reloads automatically.
      </Text>
      <StepperRow
        label="Context size"
        display={`${nCtx}`}
        onMinus={() => setNCtx(nCtx - CTX_STEP)}
        onPlus={() => setNCtx(nCtx + CTX_STEP)}
        minusDisabled={nCtx <= MIN_CONTEXT}
        plusDisabled={nCtx >= CTX_MAX}
      />
      <StepperRow
        label="GPU layers"
        display={`${nGpuLayers}`}
        onMinus={() => setNGpuLayers(nGpuLayers - 1)}
        onPlus={() => setNGpuLayers(nGpuLayers + 1)}
        minusDisabled={nGpuLayers <= 0}
        plusDisabled={nGpuLayers >= MAX_GPU_LAYERS}
      />
      <StepperRow
        label="Batch size"
        display={`${nBatch}`}
        onMinus={() => setNBatch(nBatch - BATCH_STEP)}
        onPlus={() => setNBatch(nBatch + BATCH_STEP)}
        minusDisabled={nBatch <= 1}
        plusDisabled={nBatch >= MAX_BATCH}
      />
      <StepperRow
        label="Physical batch size"
        display={`${nUbatch}`}
        onMinus={() => setNUbatch(nUbatch - BATCH_STEP)}
        onPlus={() => setNUbatch(nUbatch + BATCH_STEP)}
        minusDisabled={nUbatch <= 1}
        plusDisabled={nUbatch >= MAX_BATCH}
      />
      <StepperRow
        label="CPU threads"
        display={`${nThreads}`}
        onMinus={() => setNThreads(nThreads - 1)}
        onPlus={() => setNThreads(nThreads + 1)}
        minusDisabled={nThreads <= 1}
        plusDisabled={nThreads >= MAX_THREADS}
      />
      <Segmented
        label="Flash attention"
        value={flashAttn}
        options={FLASH_OPTIONS}
        onPick={setFlashAttn}
      />
      <Segmented<CacheType>
        label="Key cache type"
        value={cacheK}
        options={CACHE_TYPES}
        onPick={setCacheK}
      />
      <Segmented<CacheType>
        label="Value cache type"
        value={cacheV}
        options={CACHE_TYPES}
        onPick={setCacheV}
      />
      <ToggleRow
        label="Speculative decoding (MTP)"
        on={speculativeEnabled}
        onPress={() => setSpeculativeEnabled(!speculativeEnabled)}
      />
      {speculativeEnabled && (
        <>
          <Text className="font-sans text-body-sm text-secondary-text mb-1">
            Uses the loaded model's embedded draft layers — no separate draft model needed.
          </Text>
          <StepperRow
            label="Draft GPU layers"
            display={`${specDraftGpuLayers}`}
            onMinus={() => setSpecDraftGpuLayers(specDraftGpuLayers - 1)}
            onPlus={() => setSpecDraftGpuLayers(specDraftGpuLayers + 1)}
            minusDisabled={specDraftGpuLayers <= 0}
            plusDisabled={specDraftGpuLayers >= MAX_GPU_LAYERS}
          />
          <Segmented<CacheType>
            label="Draft key cache type"
            value={specDraftCacheK}
            options={CACHE_TYPES}
            onPick={setSpecDraftCacheK}
          />
          <Segmented<CacheType>
            label="Draft value cache type"
            value={specDraftCacheV}
            options={CACHE_TYPES}
            onPick={setSpecDraftCacheV}
          />
        </>
      )}
      <ToggleRow label="Lock memory (mlock)" on={useMlock} onPress={() => setUseMlock(!useMlock)} />
      <ToggleRow label="Memory-map model (mmap)" on={useMmap} onPress={() => setUseMmap(!useMmap)} />
    </View>
  );
}
