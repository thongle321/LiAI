/** Per-model thinking capability with an override (C6).
 * Run: node --test tests/thinking-capability.test.ts
 *
 * The resolver is the whole feature: one pure function decides what the
 * engine receives, so the critical acceptance — "default behaviour is
 * unchanged for every model that has never been classified" — is an
 * assert, not a code read. Resolution order mirrors PocketPal's
 * provenance minus `learned` (LiAI has no stream-learning):
 *
 *   user override > detected (ModelSpec.reasoning) > global default
 *
 * Decision (recorded in the issue): capability is a TYPED field
 * (`reasoning?: boolean`), not derived from the free-form
 * `ModelSpec.capabilities` string[]; overrides live in the inference
 * store next to the global they replace, so every settings setter —
 * which merge-patches — leaves them untouched.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { resolveThinking } from "../lib/inference/thinking.ts";
import {
  createInferenceStore,
  parseInferenceParams,
  INFERENCE_KEY,
} from "../store/inference.ts";

const ROOT = path.join(import.meta.dirname, "..");
function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

function memoryStorage(data: Record<string, string> = {}) {
  return {
    data,
    getItem: async (k: string) => data[k] ?? null,
    setItem: async (k: string, v: string) => {
      data[k] = v;
    },
    removeItem: async (k: string) => {
      delete data[k];
    },
  };
}

describe("resolveThinking (C6)", () => {
  it("keeps today's default for every unclassified model", () => {
    // THE critical acceptance: no override, no detected capability →
    // the global flag decides, exactly as before this ticket.
    const on = resolveThinking({
      modelId: "m",
      overrides: {},
      globalEnabled: true,
    });
    assert.deepEqual(on, {
      enabled: true,
      source: "unknown",
    });
    assert.equal(
      resolveThinking({
        modelId: "m",
        overrides: {},
        globalEnabled: false,
      }).enabled,
      false,
      "and the global off stays off",
    );
  });

  it("never sends enable_thinking: true for a model known not to reason", () => {
    const resolved = resolveThinking({
      modelId: "m",
      reasoning: false,
      overrides: {},
      globalEnabled: true,
    });
    assert.equal(resolved.enabled, false);
    assert.equal(resolved.source, "detected");
  });

  it("resolves a known reasoner on, regardless of the global", () => {
    const resolved = resolveThinking({
      modelId: "m",
      reasoning: true,
      overrides: {},
      globalEnabled: false,
    });
    assert.equal(resolved.enabled, true);
    assert.equal(resolved.source, "detected");
  });

  it("lets a user override beat detection in both directions", () => {
    assert.equal(
      resolveThinking({
        modelId: "m",
        reasoning: false,
        overrides: { m: true },
        globalEnabled: false,
      }).enabled,
      true,
      "user forces thinking on a model flagged non-reasoning",
    );
    assert.equal(
      resolveThinking({
        modelId: "m",
        reasoning: true,
        overrides: { m: false },
        globalEnabled: true,
      }).enabled,
      false,
      "user silences a model flagged as a reasoner",
    );
    assert.equal(
      resolveThinking({
        modelId: "m",
        reasoning: true,
        overrides: { m: false },
        globalEnabled: true,
      }).source,
      "user",
    );
  });

  it("ignores other models' overrides and falls back to the global", () => {
    assert.equal(
      resolveThinking({
        modelId: null,
        overrides: { other: false },
        globalEnabled: true,
      }).enabled,
      true,
      "no active model → the global, overrides never leak",
    );
    assert.equal(
      resolveThinking({
        modelId: "b",
        overrides: { a: false },
        globalEnabled: true,
      }).enabled,
      true,
      "an override is keyed to its own model",
    );
  });
});

describe("thinking overrides in the inference store (C6)", () => {
  let storage: ReturnType<typeof memoryStorage>;
  beforeEach(() => {
    storage = memoryStorage();
  });

  it("survives a plain settings save and a reload", async () => {
    const useStore = createInferenceStore(storage);
    await useStore.getState().load();
    useStore.getState().setThinkingOverride("m", false);
    // A plain settings save: the global flip and a sampler save — both
    // merge-patch setters. Neither may clobber the override.
    useStore.getState().setThinkingEnabled(true);
    useStore.getState().setSampler({ temperature: 0.9 });
    await new Promise((r) => setTimeout(r, 0));
    const s = useStore.getState();
    assert.deepEqual(s.thinkingOverrides, { m: false });
    assert.equal(s.thinkingEnabled, true, "the global still moves");

    const raw = storage.data[INFERENCE_KEY];
    const reloaded = createInferenceStore(memoryStorage({ [INFERENCE_KEY]: raw }));
    await reloaded.getState().load();
    assert.deepEqual(reloaded.getState().thinkingOverrides, { m: false });
  });

  it("drops non-boolean garbage from an old or hostile payload", () => {
    const parsed = parseInferenceParams(
      JSON.stringify({
        thinkingOverrides: { keep: true, drop: "yes", alsoNot: 1 },
      }),
    );
    assert.deepEqual(parsed.thinkingOverrides, { keep: true });
    assert.deepEqual(
      parseInferenceParams(JSON.stringify({ thinkingOverrides: "nope" }))
        .thinkingOverrides,
      {},
      "a malformed map degrades to no overrides",
    );
  });
});

describe("wiring (C6)", () => {
  it("the turn resolves per model instead of reading the global", () => {
    const src = read("store/chat/index.ts");
    assert.match(src, /resolveThinking\(/);
    assert.match(src, /reasoning: spec\?\.reasoning/, "detected comes from the spec");
    assert.match(src, /thinkingOverrides/, "user overrides are consulted");
  });

  it("the composer toggle resolves and writes the override", () => {
    const src = read("components/chat/MessageInput.tsx");
    assert.match(src, /resolveThinking\(/);
    assert.match(
      src,
      /setThinkingOverride\(activeModelId/,
      "a press is a per-model decision, not a global one",
    );
    assert.match(src, /thinkingOverrides/, "state comes from the resolution");
  });

  it("capability is a typed field, hydrated like other spec fields", () => {
    assert.match(
      read("types/models.ts"),
      /reasoning\?: boolean/,
      "the schema decision: typed, not a capabilities[] string",
    );
    assert.match(
      read("lib/model-upgrade.ts"),
      /reasoning: typeof v\.reasoning === "boolean" \? v\.reasoning : undefined/,
      "hydration carries it (whitelist trap from C7)",
    );
  });

  it("keeps the engine chain intact end to end", () => {
    // turn → agent options → engine request → llama.rn param. The
    // behavioural halves live in tests/turn (enableThinking threading)
    // and tests/local-engine.test.ts (forwards / omits when unset).
    assert.match(read("lib/chat/turn.ts"), /enableThinking: thinking/);
    assert.match(
      read("lib/inference/local-engine.ts"),
      /request\.enableThinking !== undefined[\s\S]{0,90}?enable_thinking: request\.enableThinking/,
      "still omitted when unset, never invented",
    );
  });
});
