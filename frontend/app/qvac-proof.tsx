/** TEMPORARY QVAC device-proof screen (Q9): delete after Q6 passes.
 *
 * Unlinked route — open on a dev-client build via the `liai://qvac-proof`
 * deep link. Runs the scripted Q6 bar (text + tool + cancel + image)
 * against QVAC catalog models and reports each step. Not part of the app;
 * carries no navigation entry and no production wiring.
 */

import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  LLAMA_3_2_1B_INST_Q4_0,
  MMPROJ_SMOLVLM2_500M_MULTIMODAL_Q8_0,
  SMOLVLM2_500M_MULTIMODAL_Q8_0,
  cancel,
  completion,
  loadModel,
  unloadModel,
  type LoadModelOptions,
} from "@qvac/sdk";

import { stripFileScheme } from "../lib/inference/qvac-engine.ts";
import { runQvacProof, type ProofClient, type ProofStep } from "../lib/inference/qvac-proof.ts";

/** 1x1 transparent PNG: proves the multimodal path, not vision quality. */
const PROBE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

type CancelArg = Parameters<typeof cancel>[0];
type CompletionArg = Parameters<typeof completion>[0];

/** Real SDK behind the proof's structural seam (device only). */
const realClient: ProofClient = {
  // SAFETY: the proof only ever passes llamacpp-completion shapes with a
  // local catalog constant source; the cast bridges our structural seam.
  loadModel: (opts) => loadModel(opts as unknown as LoadModelOptions),
  // SAFETY: the proof sends user-role history only, which the SDK's
  // history union already accepts; the cast bridges our wider role type.
  // `stream` is required by the SDK and always true for proof turns.
  completion: (opts) => {
    const params = { ...opts, stream: true };
    return completion(params as unknown as CompletionArg);
  },
  cancel: async (opts) => {
    await cancel(opts as CancelArg);
  },
  unloadModel: (opts) => unloadModel(opts),
};

async function writeProbeImage(): Promise<string> {
  const FS = await import("expo-file-system/legacy");
  const dir = FS.cacheDirectory ?? FS.documentDirectory ?? "";
  const path = `${dir}qvac-proof.png`;
  type WriteOptions = Parameters<typeof FS.writeAsStringAsync>[2];
  // SAFETY: "base64" is the legacy EncodingType.Base64 literal; the
  // options bag is structural so the literal needs only this bridge.
  await FS.writeAsStringAsync(path, PROBE_PNG_BASE64, {
    encoding: "base64",
  } as WriteOptions);
  return stripFileScheme(path);
}

export default function QvacProofRoute() {
  const [running, setRunning] = useState(false);
  const [overall, setOverall] = useState<string | null>(null);
  const [steps, setSteps] = useState<ProofStep[]>([]);

  async function run(): Promise<void> {
    if (running) return;
    setRunning(true);
    setOverall("running…");
    setSteps([]);
    try {
      const imagePath = await writeProbeImage();
      const report = await runQvacProof(
        realClient,
        {
          textModel: LLAMA_3_2_1B_INST_Q4_0,
          visionModel: SMOLVLM2_500M_MULTIMODAL_Q8_0,
          visionProj: MMPROJ_SMOLVLM2_500M_MULTIMODAL_Q8_0,
        },
        imagePath,
      );
      setSteps(report.steps);
      setOverall(report.pass ? "PROOF PASSED" : "PROOF FAILED");
    } catch (error) {
      setOverall(`HARNESS ERROR: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <ScrollView className="flex-1 bg-base px-6 pt-16">
      <Text className="font-sans-semibold text-h3 text-primary-text">
        QVAC proof (temporary)
      </Text>
      <Text className="mt-1 font-sans text-body-md text-secondary-text">
        {overall ?? "Runs the Q6 bar against catalog models. First run downloads ~2GB."}
      </Text>
      <Pressable
        onPress={() => void run()}
        disabled={running}
        className="btn btn--primary mt-4"
      >
        <Text className="font-sans-semibold text-on-primary">
          {running ? "Running…" : "Run proof"}
        </Text>
      </Pressable>
      {steps.map((s) => (
        <View key={s.name} className="mt-3 border-b border-line pb-2">
          <Text className="font-sans-semibold text-body-md text-primary-text">
            {s.pass ? "PASS" : "FAIL"} · {s.name}
          </Text>
          <Text className="font-sans text-body-md text-secondary-text">{s.detail}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
