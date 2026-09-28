/** On-device inference settings: context, batch, threads, attention, cache,
 * speculative decoding, and memory flags.
 *
 * Values persist via the inference store and reach llama.rn on the next
 * reply (the engine slot reloads when params change). Same rows render on
 * both platforms — no hardware gating.
 *
 * Grouped the way PocketPal groups them: what a first run needs up front,
 * then Advanced (collapsed), then Memory. Twenty-eight undifferentiated rows
 * is a wall, and the tuning a power user wants is not what anyone reads past
 * on day one (DESIGN.md, Settings).
 */

import { useEffect } from "react";
import { View } from "react-native";

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
import {
  AdvancedGroup,
  Segmented,
  SettingsSection,
  SliderRow,
  StepperRow,
  ToggleRow,
} from "./SettingsRows.tsx";

const CTX_STEP = 1024;
const CTX_MAX = 131072;
const BATCH_STEP = 128;
const FLASH_OPTIONS: FlashAttn[] = ["auto", "on", "off"];

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
    <>
      <SettingsSection
        title="Initialization"
        description="Takes effect on the next reply — the model reloads automatically."
      >
        <View className="row">
          <StepperRow
            label="Context size"
            description="How much conversation the model can hold at once."
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
            description="How much of the model runs on the GPU. All of it is fastest."
            display={`${nGpuLayers}`}
            value={nGpuLayers}
            min={0}
            max={MAX_GPU_LAYERS}
            onChange={setNGpuLayers}
          />
        </View>
        <View className="row">
          <SliderRow
            label="CPU threads"
            description="Cores used for the work the GPU does not take."
            display={`${nThreads}`}
            value={nThreads}
            min={1}
            max={MAX_THREADS}
            onChange={setNThreads}
          />
        </View>
      </SettingsSection>
      {/* No section title: the Advanced group IS the header row, and it is
          closed on arrival (DESIGN.md, Settings). */}
      <SettingsSection>
        <View className="row">
          <AdvancedGroup
            label="Advanced"
            description="Batching, attention, caches and speculative decoding."
          >
          <StepperRow
            label="Batch size"
            description="Tokens processed per pass. Larger is faster, heavier on memory."
            display={`${nBatch}`}
            onMinus={() => setNBatch(nBatch - BATCH_STEP)}
            onPlus={() => setNBatch(nBatch + BATCH_STEP)}
            minusDisabled={nBatch <= 1}
            plusDisabled={nBatch >= MAX_BATCH}
          />
          <StepperRow
            label="Physical batch size"
            description="The hardware-level batch underneath it."
            display={`${nUbatch}`}
            onMinus={() => setNUbatch(nUbatch - BATCH_STEP)}
            onPlus={() => setNUbatch(nUbatch + BATCH_STEP)}
            minusDisabled={nUbatch <= 1}
            plusDisabled={nUbatch >= MAX_BATCH}
          />
          <Segmented<FlashAttn>
            label="Flash attention"
            description="A faster attention kernel where the hardware has one."
            value={flashAttn}
            options={FLASH_OPTIONS}
            onPick={setFlashAttn}
          />
          <Segmented<CacheType>
            label="Key cache type"
            description="Quantisation of the cached keys. Lower saves memory."
            value={cacheK}
            options={CACHE_TYPES}
            onPick={setCacheK}
          />
          <Segmented<CacheType>
            label="Value cache type"
            description="Quantisation of the cached values. Lower saves memory."
            value={cacheV}
            options={CACHE_TYPES}
            onPick={setCacheV}
          />
          <ToggleRow
            label="Speculative decoding"
            description="Guesses ahead with the model's own draft layers, then verifies. Faster on some hardware."
            on={speculativeEnabled}
            onPress={() => setSpeculativeEnabled(!speculativeEnabled)}
          />
          {speculativeEnabled ? (
            <>
              <SliderRow
                label="Draft GPU layers"
                description="Layers the draft guess runs on."
                display={`${specDraftGpuLayers}`}
                value={specDraftGpuLayers}
                min={0}
                max={MAX_GPU_LAYERS}
                onChange={setSpecDraftGpuLayers}
              />
              <Segmented<CacheType>
                label="Draft key cache type"
                description="Quantisation of the draft guess's cached keys."
                value={specDraftCacheK}
                options={CACHE_TYPES}
                onPick={setSpecDraftCacheK}
              />
              <Segmented<CacheType>
                label="Draft value cache type"
                description="Quantisation of the draft guess's cached values."
                value={specDraftCacheV}
                options={CACHE_TYPES}
                onPick={setSpecDraftCacheV}
              />
            </>
          ) : null}
        </AdvancedGroup>
      </View>
      </SettingsSection>
      <SettingsSection
        title="Memory"
        description="How the model file is held once it is loaded."
      >
        <View className="row">
          <ToggleRow
            label="Lock memory (mlock)"
            description="Keeps the model in RAM instead of letting the OS page it out."
            on={useMlock}
            onPress={() => setUseMlock(!useMlock)}
          />
        </View>
        <View className="row">
          <ToggleRow
            label="Memory-map model (mmap)"
            description="Loads the model from disk on demand. Cheaper, slightly slower to read."
            on={useMmap}
            onPress={() => setUseMmap(!useMmap)}
          />
        </View>
      </SettingsSection>
    </>
  );
}

/** Reasoning output: a separate section because it is a template switch, not
 *  an inference param, and because it changes what a reply looks like rather
 *  than how it is generated. No load() here: InferenceSettings is mounted
 *  beside it and owns the one load for the shared inference store. */
export function ThinkingSettings() {
  const { thinkingEnabled, setThinkingEnabled } = useInference();

  return (
    <SettingsSection
      title="Thinking"
      description="Reasoning models show their working before the answer."
    >
      <View className="row">
        <ToggleRow
          label="Show thinking"
          description="Turn off to skip the reasoning pass entirely — faster, and the model answers directly."
          on={thinkingEnabled}
          onPress={() => setThinkingEnabled(!thinkingEnabled)}
        />
      </View>
    </SettingsSection>
  );
}
