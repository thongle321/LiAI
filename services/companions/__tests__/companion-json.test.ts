/** Companion export/import codec: envelope, validation, fresh-id rule. */

import {
  parseCompanionsJson,
  COMPANIONS_EXPORT_KIND,
  COMPANIONS_EXPORT_VERSION,
  toCompanionsJson,
} from "@/services/companions/companion-json.ts";
import { PIP_COMPANION } from "@/services/companions/builtins.ts";
import type { Companion } from "@/types/companion.ts";

const STORED: Companion = {
  ...PIP_COMPANION,
  id: "companion-123",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
  greeting: { text: "hi", suggestedPrompts: ["go"] },
  completionSettings: { temperature: 0.9 },
  // The fixture carries its own pact so this codec test keeps proving
  // talent round-tripping, independent of Pip's no-tools default.
  pact: {
    talents: [
      { name: "web_search", necessity: "required" },
      { name: "calculate", necessity: "optional" },
    ],
  },
};

it("round-trips a stored companion without its id or timestamps", async () => {
  const raw = await toCompanionsJson([STORED]);
  const parsed = await parseCompanionsJson(raw);
  if ("error" in parsed) throw new Error(parsed.error);
  expect(parsed.skipped).toEqual(0);
  expect(parsed.companions.length).toEqual(1);
  const [companion] = parsed.companions;
  expect(companion.name).toEqual(STORED.name);
  expect(companion.pact?.talents.map((t) => t.name)).toEqual([
    "web_search",
    "calculate",
  ]);
  expect(companion.greeting).toEqual({ text: "hi", suggestedPrompts: ["go"] });
  expect(companion.completionSettings).toEqual({ temperature: 0.9 });
  // Fresh ids at CREATE time: the file never carries one through.
  expect("id" in companion).toEqual(false);
  expect("created_at" in companion).toEqual(false);
});

it("rejects an unrelated JSON file", async () => {
  const parsed = await parseCompanionsJson('{"kind":"something-else","companions":[]}');
  expect("error" in parsed).toEqual(true);
});

it("stamps the versioned envelope", async () => {
  const raw: unknown = JSON.parse(await toCompanionsJson([STORED]));
  expect((raw as Record<string, unknown>).kind).toEqual(COMPANIONS_EXPORT_KIND);
  expect((raw as Record<string, unknown>).version).toEqual(COMPANIONS_EXPORT_VERSION);
});

it("rejects non-JSON, foreign files and empty lists", async () => {
  expect(await parseCompanionsJson("not json")).toEqual({ error: "That file is not valid JSON." });
  expect(await parseCompanionsJson('{"kind":"other","companions":[]}')).toEqual({
    error: "That file is not a LiAI companions export.",
  });
  expect(await parseCompanionsJson('{"kind":"liai-companions","companions":{}}')).toEqual({
    error: "That companions file has no companion list.",
  });
  expect(await parseCompanionsJson('{"kind":"liai-companions","companions":[{"name":""}]}')).toEqual({
    error: "That companions file contains no usable companions.",
  });
});

it("skips unusable entries and keeps the good ones", async () => {
  const raw = JSON.stringify({
    kind: "liai-companions",
    version: 1,
    companions: [
      { name: "Good", systemPrompt: "hello" },
      { name: "", systemPrompt: "bad" },
      { systemPrompt: "no name" },
      "not an object",
      { name: "Also good", systemPrompt: "yo" },
    ],
  });
  const parsed = await parseCompanionsJson(raw);
  if ("error" in parsed) throw new Error(parsed.error);
  expect(parsed.companions.map((p) => p.name)).toEqual(["Good", "Also good"]);
  expect(parsed.skipped).toEqual(3);
});
