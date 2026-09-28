/** Model Initialization, Memory, and Model Loading cards.
 *
 * Grouped and labelled to mirror PocketPal's settings screen row for row,
 * in our tokens and our card pattern. Two deliberate deviations, both ours:
 * the compute-device control is an honest Hexagon toggle (llama.rn has no
 * Metal/GPU/CPU selector — see the row's own note), and the context floor
 * is 512 rather than PocketPal's 200, because small models need it.
 *
 * Values persist via the inference store and reach llama.rn on the next
 * reply: the engine slot reloads when any init param changes.
 */

import { useEffect } from "react";
import { Platform, Text, View } from "react-native";

import {
  CACHE_TYPES,
  MAX_BATCH,
  MAX_GPU_LAYERS,
  MAX_IMAGE_TOKENS,
  MAX_THREADS,
  MIN_CONTEXT,
  MIN_IMAGE_TOKENS,
  useInference,
  type CacheType,
  type FlashAttn,
} from "../store/inference.ts";
import { useModelStore } from "../store/modelStore";
import { useModelsUi } from "../store/modelsUi.ts";
import {
  AdvancedGroup,
  PickerRow,
  Segmented,
  SettingsSection,
  SliderRow,
  TextFieldRow,
  ToggleRow,
} from "./SettingsRows.tsx";

const FLASH_OPTIONS: FlashAttn[] = ["auto", "on", "off"];
/** "None" in the draft picker: the model's own embedded MTP layers. */
const NO_DRAFT = "";

export function ModelInitializationSettings() {
  const {
    nCtx,
    nGpuLayers,
    imageMaxTokens,
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
    draftModelId,
    useHexagonNpu,
    load,
    setNCtx,
    setNGpuLayers,
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
    setDraftModelId,
    setImageMaxTokens,
    setUseHexagonNpu,
  } = useInference();
  const models = useModelStore((s) => s.models);
  const activeModelId = useModelStore((s) => s.activeModelId);

  useEffect(() => {
    void load();
  }, []);

  // A draft has to be a real, downloaded model, and never the model being
  // drafted for.
  const draftOptions = [
    NO_DRAFT,
    ...models
      .filter(
        (m) =>
          m.downloadStatus === "completed" &&
          m.type === "llm" &&
          m.id !== activeModelId,
      )
      .map((m) => m.id),
  ];
  const draftName = new Map(models.map((m) => [m.id, m.name]));

  return (
    <SettingsSection
      title="Model Initialization Settings"
      description="Takes effect on the next reply — the model reloads automatically."
    >
      {Platform.OS === "android" ? (
        <View className="row">
          <ToggleRow
            label="Use Hexagon NPU"
            description="Run parts of the model on the Hexagon DSP. Faster, but not every model is quantised for it."
            on={useHexagonNpu}
            onPress={() => setUseHexagonNpu(!useHexagonNpu)}
          />
        </View>
      ) : null}
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
        <TextFieldRow
          label="Context Size"
          description="How much conversation the model can hold at once."
          value={nCtx}
          min={MIN_CONTEXT}
          placeholder={`Enter context size (min ${MIN_CONTEXT})`}
          invalidMessage={`Please enter a valid number (minimum ${MIN_CONTEXT})`}
          onCommit={setNCtx}
        />
      </View>
      {/* No .row wrapper here: AdvancedGroup wraps its own children, so
          wrapping it would stack the inset and add a second divider. */}
      <AdvancedGroup
        label="Advanced Settings"
          description="Batching, attention, caches, and speculative decoding."
        >
          <SliderRow
            label="Batch Size"
            description="Tokens processed per pass. Larger is faster, heavier on memory."
            display={`${nBatch}`}
            value={nBatch}
            min={1}
            max={MAX_BATCH}
            step={1}
            onChange={setNBatch}
          />
          <SliderRow
            label="Physical Batch Size"
            description="The hardware-level batch underneath it."
            display={`${nUbatch}`}
            value={nUbatch}
            min={1}
            max={MAX_BATCH}
            step={1}
            onChange={setNUbatch}
          />
          <SliderRow
            label="CPU Threads"
            description={`Using ${nThreads} of ${MAX_THREADS} available threads`}
            display={`${nThreads}`}
            value={nThreads}
            min={1}
            max={MAX_THREADS}
            step={1}
            onChange={setNThreads}
          />
          <SliderRow
            label="Image Max Tokens"
            description="Maximum tokens for image processing (lower = faster, less detail). Applied when the model loads."
            display={`${imageMaxTokens}`}
            value={imageMaxTokens}
            min={MIN_IMAGE_TOKENS}
            max={MAX_IMAGE_TOKENS}
            step={1}
            onChange={setImageMaxTokens}
          />
          <Segmented<FlashAttn>
            label="Flash Attention"
            description="Memory-efficient attention (auto-enabled on Metal)."
            value={flashAttn}
            options={FLASH_OPTIONS}
            onPick={setFlashAttn}
          />
          <PickerRow<CacheType>
            label="Key Cache Type"
            description="Select the cache type for key computation."
            options={CACHE_TYPES}
            value={cacheK}
            onChange={setCacheK}
          />
          <PickerRow<CacheType>
            label="Value Cache Type"
            description="Select the cache type for value computation."
            options={CACHE_TYPES}
            value={cacheV}
            onChange={setCacheV}
          />
          <ToggleRow
            label="Speculative Decoding"
            description="Use a small draft model (or an embedded MTP model) to predict tokens and speed up generation. Experimental."
            on={speculativeEnabled}
            onPress={() => setSpeculativeEnabled(!speculativeEnabled)}
          />
          {speculativeEnabled ? (
            <>
              <PickerRow
                label="Draft Model"
                description="Drafts tokens for the active model."
                options={draftOptions}
                value={draftModelId ?? NO_DRAFT}
                onChange={(id) => setDraftModelId(id === NO_DRAFT ? null : id)}
                displayFor={(id) =>
                  id === NO_DRAFT
                    ? "None (embedded MTP)"
                    : (draftName.get(id) ?? id)
                }
              />
              <SliderRow
                label="Draft GPU Layers"
                description="Number of draft-model layers to offload to the GPU."
                display={`${specDraftGpuLayers}`}
                value={specDraftGpuLayers}
                min={0}
                max={MAX_GPU_LAYERS}
                step={1}
                onChange={setSpecDraftGpuLayers}
              />
              <PickerRow<CacheType>
                label="Draft Key Cache Type"
                description="Applies once speculative decoding runs."
                options={CACHE_TYPES}
                value={specDraftCacheK}
                onChange={setSpecDraftCacheK}
              />
              <PickerRow<CacheType>
                label="Draft Value Cache Type"
                description="Applies once speculative decoding runs."
                options={CACHE_TYPES}
                value={specDraftCacheV}
                onChange={setSpecDraftCacheV}
              />
            </>
          ) : null}
        </AdvancedGroup>
      </SettingsSection>
  );
}

export function MemorySettings() {
  const {
    useMlock,
    useMmap,
    useWeightRepacking,
    load,
    setUseMlock,
    setUseMmap,
    setUseWeightRepacking,
  } = useInference();

  useEffect(() => {
    void load();
  }, []);

  return (
    <SettingsSection title="Memory Settings">
      <View className="row">
        <ToggleRow
          label="Use Memory Lock"
          description="Force system to keep model in RAM rather than swapping or compressing."
          on={useMlock}
          onPress={() => setUseMlock(!useMlock)}
        />
      </View>
      <View className="row">
        <ToggleRow
          label="Memory Mapping"
          description="Use memory-mapped files for faster model loading."
          on={useMmap}
          onPress={() => setUseMmap(!useMmap)}
        />
      </View>
      {Platform.OS === "android" ? (
        <View className="row">
          <ToggleRow
            label="Enable Weight Repacking"
            description="Faster prompt processing with minimal memory overhead when memory mapping is disabled. Token generation is unaffected."
            on={useWeightRepacking}
            onPress={() => setUseWeightRepacking(!useWeightRepacking)}
          />
        </View>
      ) : null}
      <View className="row">
        <Text className="font-sans text-body-sm text-secondary-text">
          Model reload needed for changes to take effect.
        </Text>
      </View>
    </SettingsSection>
  );
}

export function ModelLoadingSettings() {
  const { autoOffload, load, setAutoOffload } = useInference();
  const { autoNavigateToChat, setAutoNavigateToChat, load: loadUi } = useModelsUi();

  useEffect(() => {
    void load();
    void loadUi();
  }, []);

  return (
    <SettingsSection title="Model Loading Settings">
      <View className="row">
        <ToggleRow
          label="Auto Offload/Load"
          description="Offload model when app is in background."
          on={autoOffload}
          onPress={() => setAutoOffload(!autoOffload)}
        />
      </View>
      <View className="row">
        <ToggleRow
          label="Auto-Navigate to Chat"
          description="Jump to chat when you activate a model."
          on={autoNavigateToChat}
          onPress={() => setAutoNavigateToChat(!autoNavigateToChat)}
        />
      </View>
    </SettingsSection>
  );
}
