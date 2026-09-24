/** QVAC device-proof runner (Q6/Q9): scripted Q6 bar, report, no throw.
 *
 * Native-free like the adapter: the screen injects the real `@qvac/sdk`
 * functions behind ProofClient, node tests inject scripted fakes. Each
 * phase records pass/fail with a detail string; a failed text load skips
 * the dependent text steps but still attempts the independent vision
 * phase. Unloads always run for models that loaded (downloads kept:
 * clearStorage false).
 */

import type { QvacEvent } from "./qvac-engine.ts";

export interface ProofStep {
  name: string;
  pass: boolean;
  detail: string;
}

export interface ProofReport {
  pass: boolean;
  steps: ProofStep[];
}

export interface ProofHistoryMessage {
  role: string;
  content: string;
  attachments?: Array<{ path: string }>;
}

export interface ProofTool {
  type: "function";
  name: string;
  description: string;
  parameters: unknown;
}

export interface ProofFinal {
  contentText: string;
  toolCalls: Array<{ name: string }>;
  stopReason?: string;
}

export interface ProofRun {
  requestId: string;
  events: AsyncIterable<QvacEvent>;
  final: Promise<ProofFinal>;
}

/** Structural slice of `@qvac/sdk` the proof touches (fakes satisfy it). */
export interface ProofClient {
  loadModel(opts: {
    modelSrc: unknown;
    modelType: string;
    modelConfig: Record<string, unknown>;
  }): Promise<string>;
  completion(opts: {
    modelId: string;
    history: ProofHistoryMessage[];
    stream: boolean;
    tools?: ProofTool[];
  }): ProofRun;
  cancel(opts: { requestId: string }): Promise<void> | void;
  unloadModel(opts: { modelId: string; clearStorage: boolean }): Promise<void> | void;
}

export interface ProofModels {
  textModel: unknown;
  visionModel: unknown;
  visionProj: unknown;
}

const PROOF_TOOL: ProofTool = {
  type: "function",
  name: "get_proof_value",
  description: "Return the fixed proof value.",
  parameters: { type: "object", properties: {} },
};

function step(steps: ProofStep[], name: string, pass: boolean, detail: string): void {
  steps.push({ name, pass, detail });
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function collectText(run: ProofRun): Promise<{ text: string; stopReason?: string }> {
  let text = "";
  for await (const event of run.events) {
    if (event.type === "contentDelta") text += event.text;
    if (event.type === "completionDone") return { text, stopReason: event.stopReason };
  }
  const final = await run.final;
  return { text: text !== "" ? text : final.contentText, stopReason: final.stopReason };
}

/** Run the Q6 bar; never throws (failures land in the report). */
export async function runQvacProof(
  client: ProofClient,
  models: ProofModels,
  imagePath: string,
  loadConfig: Record<string, unknown> = { ctx_size: 2048, device: "cpu" },
): Promise<ProofReport> {
  const steps: ProofStep[] = [];
  let textId: string | null = null;
  try {
    textId = await client.loadModel({
      modelSrc: models.textModel,
      modelType: "llamacpp-completion",
      modelConfig: loadConfig,
    });
    step(steps, "load-text-model", true, `modelId ${textId}`);
  } catch (error) {
    step(steps, "load-text-model", false, messageOf(error));
  }

  if (textId !== null) {
    try {
      const run = client.completion({
        modelId: textId,
        history: [{ role: "user", content: "Say hello in one short sentence." }],
        stream: true,
      });
      const { text } = await collectText(run);
      step(steps, "stream-text", text.trim() !== "", text.slice(0, 120));
    } catch (error) {
      step(steps, "stream-text", false, messageOf(error));
    }

    try {
      const run = client.completion({
        modelId: textId,
        history: [{ role: "user", content: "Call the get_proof_value tool now." }],
        stream: true,
        tools: [PROOF_TOOL],
      });
      for await (const _event of run.events) {
        // Drain the stream; the verdict comes from the final below.
      }
      const final = await run.final;
      const seen = final.toolCalls.some((c) => c.name === PROOF_TOOL.name);
      step(steps, "tool-call", seen, seen ? "get_proof_value called" : "no tool call emitted");
    } catch (error) {
      step(steps, "tool-call", false, messageOf(error));
    }

    try {
      const run = client.completion({
        modelId: textId,
        history: [{ role: "user", content: "Count slowly from one to one hundred." }],
        stream: true,
      });
      const requestId = run.requestId;
      await client.cancel({ requestId });
      const { stopReason } = await collectText(run);
      step(steps, "cancel", true, `run ended (${stopReason ?? "no reason"})`);
    } catch (error) {
      step(steps, "cancel", false, messageOf(error));
    }

    try {
      await client.unloadModel({ modelId: textId, clearStorage: false });
    } catch {
      // Best-effort: the report already holds the step verdicts.
    }
    textId = null;
  } else {
    step(steps, "stream-text", false, "skipped (no text model)");
    step(steps, "tool-call", false, "skipped (no text model)");
    step(steps, "cancel", false, "skipped (no text model)");
  }

  let visionId: string | null = null;
  try {
    visionId = await client.loadModel({
      modelSrc: models.visionModel,
      modelType: "llamacpp-completion",
      modelConfig: { ...loadConfig, projectionModelSrc: models.visionProj },
    });
    step(steps, "load-vision-model", true, `modelId ${visionId}`);
  } catch (error) {
    step(steps, "load-vision-model", false, messageOf(error));
  }

  if (visionId !== null) {
    try {
      const run = client.completion({
        modelId: visionId,
        history: [
          {
            role: "user",
            content: "What is in this image? One short sentence.",
            attachments: [{ path: imagePath }],
          },
        ],
        stream: true,
      });
      const { text } = await collectText(run);
      step(steps, "image-turn", text.trim() !== "", text.slice(0, 120));
    } catch (error) {
      step(steps, "image-turn", false, messageOf(error));
    }
    try {
      await client.unloadModel({ modelId: visionId, clearStorage: false });
    } catch {
      // Best-effort: see above.
    }
  } else {
    step(steps, "image-turn", false, "skipped (no vision model)");
  }

  return { pass: steps.every((s) => s.pass), steps };
}
