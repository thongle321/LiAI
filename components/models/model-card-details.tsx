/** Expanded detail for a downloaded model card (PocketPal ModelCard
 * parity): full name, estimated RAM need, capabilities, spec grid,
 * integrity status, and the vision controls.
 *
 * Vision: the per-model switch, the projector selector (PocketPal's
 * ProjectionModelSelector, over our inline-projector shape), and the
 * missing-projection warning. Architecture appears only when stored
 * metadata carries it (never populated today).
 */

import { useEffect, useState } from "react";
import { Alert, Linking, Pressable, Text, View } from "react-native";
import * as FileSystem from "expo-file-system/legacy";

import { ExternalLink, ImageOff } from "lucide-react-native";

import { useShallow } from "zustand/react/shallow";
import { useInference } from "@/store/inference.ts";
import { useModelStore } from "@/store/modelStore";
import { useChatStore } from "@/store/chat";
import { resolveLocalFile } from "@/services/inference/engine.ts";
import { formatParams } from "@/services/search/model-providers.ts";
import { readTotalMemory } from "@/services/models/device-tiers.ts";
import {
  projectorStatus,
  visionActive,
} from "@/services/models/vision-pairing.ts";
import { colors } from "@/themes/tokens.ts";
import {
  estimateModelMemory,
  toMemoryMetadata,
} from "@/services/models/memoryEstimator.ts";
import {
  checkModelFileIntegrity,
  type IntegrityResult,
} from "@/services/models/modelIntegrity.ts";
import type { ModelSpec } from "@/types/models";
import { Chip, formatBytes } from "./model-bits.tsx";
import { ToggleRow } from "../settings-rows.tsx";
import { ProjectorSelectorSheet } from "./projector-selector-sheet.tsx";

/** One sub-card in the details grid: muted label over medium value. */
function DetailCell({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-w-[45%] flex-1 rounded-lg bg-surface-2 p-3">
      <Text className="text-quiet">{label}</Text>
      <Text className="font-sans-semibold text-body-md text-primary-text">
        {value}
      </Text>
    </View>
  );
}

export function ModelCardDetails({
  item,
  fileBytes,
}: {
  item: ModelSpec;
  /** Summed by the card (single owner) so the two never disagree. */
  fileBytes: number;
}) {
  // One useShallow unit: the estimate reads exactly these six, so
  // unrelated inference writes never rebuild this card.
  const { nCtx, cacheK, cacheV, nUbatch, specDraftCacheK, specDraftCacheV } =
    useInference(
      useShallow((s) => ({
        nCtx: s.nCtx,
        cacheK: s.cacheK,
        cacheV: s.cacheV,
        nUbatch: s.nUbatch,
        specDraftCacheK: s.specDraftCacheK,
        specDraftCacheV: s.specDraftCacheV,
      })),
    );

  // Revalidates whenever the spec object changes — redownloads arrive
  // as a new object under the same id.
  const [integrity, setIntegrity] = useState<IntegrityResult | null>(null);
  const [totalMemory, setTotalMemory] = useState<number | null>(null);
  const [projectorSheetOpen, setProjectorSheetOpen] = useState(false);
  const setVisionEnabled = useModelStore((s) => s.setVisionEnabled);
  const startProjectorDownload = useModelStore((s) => s.startProjectorDownload);
  const activeModelId = useModelStore((s) => s.activeModelId);
  const releaseEngine = useChatStore((s) => s.releaseEngine);
  // PocketParity: the reference's expanded panel describes a model that is
  // on disk. Its MemoryRequirement (ModelCard.tsx:820-900) renders only when
  // `isDownloaded && !isRemote`, and nothing here is remote — so a card with
  // no file yet shows the catalog facts and says nothing about this device.
  const isDownloaded = item.downloadStatus === "completed";
  // What integrity is a statement ABOUT is the files on disk, so the effect
  // keys on their signature — not on the spec object's identity. A catalog
  // preset's view is rebuilt on every progress tick (presetSpecView returns a
  // fresh object), and an identity dep would re-stat the same path on each
  // one; a redownload still changes the signature when a file's name or
  // size does.
  const fileKey = item.files.map((f) => `${f.name}:${f.size}`).join("|");
  useEffect(() => {
    let live = true;
    void readTotalMemory().then((v) => {
      if (live) setTotalMemory(v);
    });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    // No file, nothing to verify: checking a preset that was never fetched
    // stats a path that cannot exist and reports a corrupt download.
    if (!isDownloaded) {
      setIntegrity(null);
      return;
    }
    let live = true;
    void (async () => {
      const base = FileSystem.documentDirectory ?? "";
      // Measured bytes accumulate off the stat calls — never the
      // manifest sum, so a later "verified X" display tells the truth.
      let actualTotal = 0;
      let expectedTotal = 0;
      for (const f of item.files) {
        const result = await checkModelFileIntegrity(
          resolveLocalFile(base, f.name),
          f.size || undefined,
        );
        if (!result.isValid) {
          if (live) setIntegrity(result);
          return;
        }
        actualTotal += result.actualBytes ?? 0;
        expectedTotal += result.expectedBytes ?? 0;
      }
      if (live) {
        setIntegrity({
          isValid: true,
          exists: true,
          actualBytes: actualTotal,
          expectedBytes: expectedTotal,
        });
      }
    })();
    return () => {
      live = false;
    };
  }, [fileKey, isDownloaded]);

  const estimate = estimateModelMemory(
    { size: fileBytes, gguf: toMemoryMetadata(item.ggufMetadata) },
    undefined,
    undefined,
    {
      nCtx,
      cacheK,
      cacheV,
      nUbatch,
      specDraftCacheK,
      specDraftCacheV,
    },
  );

  const architecture =
    typeof item.ggufMetadata?.architecture === "string"
      ? item.ggufMetadata.architecture
      : undefined;

  // Vision state, read through the one rule (services/models//vision-pairing).
  // "completed" is the pair's proof of landing: the downloader marks the
  // row complete only after the projector leg too (pairDownloadStep).
  const visionOn = item.visionEnabled !== false;
  const projector = projectorStatus({
    hasProjector: item.projector !== undefined,
    projectorBytes:
      item.projector !== undefined && item.downloadStatus === "completed"
        ? item.projector.size
        : 0,
  });
  const visionReady = visionActive({ visionEnabled: visionOn, status: projector });
  const projectorMissing =
    item.supportsVision === true &&
    visionOn &&
    item.projector !== undefined &&
    projector === "missing";
  const isActive = activeModelId === item.id;

  function toggleVision(enabled: boolean): void {
    const apply = (): void => {
      setVisionEnabled(item.id, enabled);
      if (isActive) void releaseEngine();
    };
    // Changing vision under a loaded model drops the loaded context (Q6):
    // confirm first, because a silent reload mid-chat is worse than a tap.
    if (!isActive) {
      apply();
      return;
    }
    Alert.alert(
      "Reload model",
      enabled
        ? "Turning vision on reloads the model. Reload it now?"
        : "Turning vision off reloads the model without the projector. Reload it now?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Reload", onPress: apply },
      ],
    );
  }

  return (
    <View>
      {/* PocketPal's full-name box (ModelCard.tsx:820-900): the model name in
          the same soft sub-card the detail grid uses, so the expanded panel
          opens on one full-width fact rather than loose text. */}
      <View className="rounded-lg bg-surface-2 p-3">
        <Text className="text-quiet">Model name</Text>
        <Text
          selectable
          className="font-sans text-body-md text-primary-text"
        >
          {item.name}
        </Text>
      </View>

      {isDownloaded ? (
        <View className="mt-3">
          <Text className="font-sans text-body-md text-primary-text">
            Estimated memory: ~{formatBytes(estimate)}
          </Text>
          <Text className="text-quiet">
            Weights + context cache at your current settings.
          </Text>
          {totalMemory !== null && estimate > totalMemory * 0.9 ? (
            <Text className="mt-2 font-sans text-body-md text-error">
              This model needs more RAM than this device has. It may fail to load.
            </Text>
          ) : null}
        </View>
      ) : null}

      {item.capabilities && item.capabilities.length > 0 ? (
        <View className="mt-3 flex-row flex-wrap gap-2">
          {item.capabilities.map((cap) => (
            <Chip key={cap} label={cap} />
          ))}
          {/* MTP can't be read from GGUF metadata today, so the badge is
              capability-string best-effort (PocketPal parity intent). */}
          {item.capabilities.some((c) => /mtp|speculative/i.test(c)) ? (
            <Chip label="MTP" />
          ) : null}
        </View>
      ) : null}

      {item.supportsVision === true ? (
        <View className="mt-3">
          <ToggleRow
            label="Vision"
            description="Process images as well as text"
            on={visionOn}
            onPress={() => toggleVision(!visionOn)}
          />
          {!visionOn ? (
            <Text className="text-quiet">
              Vision is off — this model answers text only.
            </Text>
          ) : null}
          {visionOn ? (
            <>
              {projectorMissing ? (
                <Pressable
                  onPress={() => void startProjectorDownload(item.id)}
                  className="mt-2 min-h-12 flex-row items-center gap-2 self-start rounded-lg border border-border px-4 py-2"
                  accessibilityRole="button"
                  accessibilityLabel="Download projection model"
                >
                  <ImageOff size={16} color={colors.error} />
                  <Text className="font-sans text-body-sm text-error">
                    Download projection model
                  </Text>
                </Pressable>
              ) : null}
              {item.projector !== undefined || (item.projectorCandidates?.length ?? 0) > 0 ? (
                <Pressable
                  onPress={() => setProjectorSheetOpen(true)}
                  className="mt-2 min-h-12 flex-row items-center justify-between gap-2 rounded-lg border border-border px-4 py-2"
                  accessibilityRole="button"
                  accessibilityLabel="Choose projection model"
                >
                  <Text
                    numberOfLines={1}
                    className="flex-1 font-sans text-body-sm text-primary-text"
                  >
                    {item.projector !== undefined
                      ? `Projection model: ${item.projector.name}`
                      : "Choose a projection model"}
                  </Text>
                  <Text className="text-quiet">
                    {visionReady ? "Ready" : "Not set"}
                  </Text>
                </Pressable>
              ) : null}
            </>
          ) : null}
        </View>
      ) : null}

      {/* PocketPal's 2-column details grid: rounded sub-cards (bg
          surface-2), muted label over medium value. */}
      <View className="mt-3 flex-row flex-wrap gap-3">
        {item.params ? (
          <DetailCell label="Parameters" value={formatParams(item.params)} />
        ) : null}
        <DetailCell label="Context length" value={`${nCtx}`} />
        {architecture ? (
          <DetailCell label="Architecture" value={architecture} />
        ) : null}
        {item.author ? (
          <DetailCell label="Author" value={item.author} />
        ) : null}
      </View>

      {integrity && !integrity.isValid ? (
        <Text className="mt-3 font-sans text-body-md text-error">
          {integrity.exists &&
          integrity.actualBytes !== null &&
          integrity.expectedBytes !== null
            ? `Model file size mismatch (${formatBytes(integrity.actualBytes)} vs ${formatBytes(integrity.expectedBytes)}). Please delete and redownload.`
            : "Model file is missing. Please redownload."}
        </Text>
      ) : null}

      {item.hfUrl ? (
        /* PocketParity: the reference's hfLinkButton (ModelCard.tsx
           :990-1024) is a button with the external-link glyph and the words
           "View Model Card on Hugging Face" — not a bare link. `.btn
           --secondary` is this system's outlined button (DESIGN.md
           "Outline": Signal Mark border), so the outline is the design
           system's rather than a hand-lifted `border-border`. */
        <Pressable
          onPress={() => void Linking.openURL(item.hfUrl as string).catch(() => {})}
          className="btn btn--secondary active:opacity-80 mt-3 self-start gap-2"
          accessibilityRole="link"
          accessibilityLabel="View Model Card on Hugging Face"
        >
          <ExternalLink size={14} color={colors.primary} />
          <Text className="font-sans text-body-sm text-primary">
            View Model Card on Hugging Face
          </Text>
        </Pressable>
      ) : null}

      <ProjectorSelectorSheet
        model={projectorSheetOpen ? item : null}
        visible={projectorSheetOpen}
        onClose={() => setProjectorSheetOpen(false)}
      />
    </View>
  );
}
