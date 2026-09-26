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
import { SliderRow, StepperRow, ToggleRow } from "./SettingsRows.tsx";

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
    <View className="py-2">
      <Text className="font-sans text-body-md text-primary-text">{label}</Text>
      {hint && (
        <Text className="font-sans text-body-sm text-secondary-text mt-0.5">{hint}</Text>
      )}
      <View className="flex-row gap-2 mt-2">
        {options.map((o) => (
          <Pressable
            key={o}
            onPress={() => onPick(o)}
            className={o === value ? "seg seg--active" : "seg"}
            accessibilityRole="radio"
            accessibilityLabel={o}
            accessibilityState={{ selected: o === value }}
          >
            <Text className={o === value ? "seg-label seg-label--active" : "seg-label"}>
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
      <Text className="mb-2 font-sans-semibold text-h4 text-primary-text">On-device model</Text>
      <Text className="mb-3 font-sans text-body-sm text-secondary-text">
        Takes effect on the next reply — the model reloads automatically.
      </Text>
      <View className="rows mb-3">
        <View className="row">
          <StepperRow
            label="Context size"
            display={`${nCtx}`}
            onMinus={() => setNCtx(nCtx - CTX_STEP)}
            onPlus={() => setNCtx(nCtx + CTX_STEP)}
            minusDisabled={nCtx <= MIN_CONTEXT}
            plusDisabled={nCtx >= CTX_MAX}
          />
        </View>
        <View className="row">
          <SliderRow
            label="GPU layers"
            display={`${nGpuLayers}`}
            value={nGpuLayers}
            min={0}
            max={MAX_GPU_LAYERS}
            onChange={setNGpuLayers}
          />
        </View>
        <View className="row">
          <StepperRow
            label="Batch size"
            display={`${nBatch}`}
            onMinus={() => setNBatch(nBatch - BATCH_STEP)}
            onPlus={() => setNBatch(nBatch + BATCH_STEP)}
            minusDisabled={nBatch <= 1}
            plusDisabled={nBatch >= MAX_BATCH}
          />
        </View>
        <View className="row">
          <StepperRow
            label="Physical batch size"
            display={`${nUbatch}`}
            onMinus={() => setNUbatch(nUbatch - BATCH_STEP)}
            onPlus={() => setNUbatch(nUbatch + BATCH_STEP)}
            minusDisabled={nUbatch <= 1}
            plusDisabled={nUbatch >= MAX_BATCH}
          />
        </View>
        <View className="row">
          <SliderRow
            label="CPU threads"
            display={`${nThreads}`}
            value={nThreads}
            min={1}
            max={MAX_THREADS}
            onChange={setNThreads}
          />
        </View>
      </View>
      <View className="rows">
        <View className="row">
          <Segmented
            label="Flash attention"
            value={flashAttn}
            options={FLASH_OPTIONS}
            onPick={setFlashAttn}
          />
        </View>
        <View className="row">
          <Segmented<CacheType>
            label="Key cache type"
            value={cacheK}
            options={CACHE_TYPES}
            onPick={setCacheK}
          />
        </View>
        <View className="row">
          <Segmented<CacheType>
            label="Value cache type"
            value={cacheV}
            options={CACHE_TYPES}
            onPick={setCacheV}
          />
        </View>
        <View className="row">
          <ToggleRow
            label="Speculative decoding (MTP)"
            on={speculativeEnabled}
            onPress={() => setSpeculativeEnabled(!speculativeEnabled)}
          />
        </View>
      </View>
      {speculativeEnabled && (
        <>
          <Text className="mt-2 mb-1 font-sans text-body-sm text-secondary-text">
            Uses the loaded model's embedded draft layers — no separate draft model needed.
          </Text>
          <View className="rows mb-3">
            <View className="row">
              <SliderRow
                label="Draft GPU layers"
                display={`${specDraftGpuLayers}`}
                value={specDraftGpuLayers}
                min={0}
                max={MAX_GPU_LAYERS}
                onChange={setSpecDraftGpuLayers}
              />
            </View>
            <View className="row">
              <Segmented<CacheType>
                label="Draft key cache type"
                value={specDraftCacheK}
                options={CACHE_TYPES}
                onPick={setSpecDraftCacheK}
              />
            </View>
            <View className="row">
              <Segmented<CacheType>
                label="Draft value cache type"
                value={specDraftCacheV}
                options={CACHE_TYPES}
                onPick={setSpecDraftCacheV}
              />
            </View>
          </View>
        </>
      )}
      <View className="rows">
        <View className="row">
          <ToggleRow label="Lock memory (mlock)" on={useMlock} onPress={() => setUseMlock(!useMlock)} />
        </View>
        <View className="row">
          <ToggleRow label="Memory-map model (mmap)" on={useMmap} onPress={() => setUseMmap(!useMmap)} />
        </View>
      </View>
    </View>
  );
}
