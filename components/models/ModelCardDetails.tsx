/** Expanded detail for a downloaded model card (PocketPal ModelCard
 * parity): full name, estimated RAM need, capabilities, spec grid,
 * integrity status.
 *
 * Out by decision, not by omission: the vision toggle + projector
 * selector and the projection-download warning (no pairing machinery
 * exists yet — pairing ticket), and MTP capability text (no GGUF
 * metadata to read it from). Architecture appears only when stored
 * metadata carries it (never populated today); the author cell is
 * skipped — the card header already shows it.
 */

import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import * as FileSystem from "expo-file-system/legacy";

import { useInference } from "../../store/inference.ts";
import { resolveLocalFile } from "../../lib/inference/engine.ts";
import { formatParams } from "../../lib/model-providers.ts";
import {
  estimateModelMemory,
  toMemoryMetadata,
} from "../../lib/models/memoryEstimator.ts";
import {
  checkModelFileIntegrity,
  type IntegrityResult,
} from "../../lib/models/modelIntegrity.ts";
import type { ModelSpec } from "../../types/models";
import { formatBytes } from "./ModelBits.tsx";

export function ModelCardDetails({
  item,
  fileBytes,
}: {
  item: ModelSpec;
  /** Summed by the card (single owner) so the two never disagree. */
  fileBytes: number;
}) {
  const { nCtx, cacheK, cacheV, nUbatch, specDraftCacheK, specDraftCacheV } =
    useInference();

  // Revalidates whenever the spec object changes — redownloads arrive
  // as a new object under the same id.
  const [integrity, setIntegrity] = useState<IntegrityResult | null>(null);
  useEffect(() => {
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
  }, [item]);

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

  return (
    <View>
      <Text className="font-sans text-body-sm text-secondary-text">
        Model name
      </Text>
      <Text
        selectable
        className="font-sans text-body-md text-primary-text"
      >
        {item.name}
      </Text>

      <Text className="mt-3 font-sans text-body-md text-primary-text">
        Estimated memory: ~{formatBytes(estimate)}
      </Text>
      <Text className="font-sans text-body-sm text-secondary-text">
        Weights + context cache at your current settings.
      </Text>

      {item.capabilities && item.capabilities.length > 0 ? (
        <Text className="mt-3 font-sans text-body-md text-secondary-text">
          {item.capabilities.join(", ")} capabilities
        </Text>
      ) : null}

      {item.params || architecture ? (
        <View className="mt-3 flex-row gap-4">
          {item.params ? (
            <View className="flex-1">
              {/* Body Small, not Caption: these are labels, and
                  Caption-Means-Metadata reserves Caption for counted
                  or happened metadata. */}
              <Text className="font-sans text-body-sm text-secondary-text">
                Parameters
              </Text>
              <Text className="font-sans text-body-md text-primary-text">
                {formatParams(item.params)}
              </Text>
            </View>
          ) : null}
          {architecture ? (
            <View className="flex-1">
              <Text className="font-sans text-body-sm text-secondary-text">
                Architecture
              </Text>
              <Text className="font-sans text-body-md text-primary-text">
                {architecture}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {integrity && !integrity.isValid ? (
        <Text className="mt-3 font-sans text-body-md text-error">
          {integrity.exists &&
          integrity.actualBytes !== null &&
          integrity.expectedBytes !== null
            ? `Model file size mismatch (${formatBytes(integrity.actualBytes)} vs ${formatBytes(integrity.expectedBytes)}). Please delete and redownload.`
            : "Model file is missing. Please redownload."}
        </Text>
      ) : null}
    </View>
  );
}
