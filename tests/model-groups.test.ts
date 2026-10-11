/** Models-screen grouping (PocketParity: pocketpal-ai ModelsScreen.tsx:275-384).
 *
 * Run: node --test tests/model-groups.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  AVAILABLE_TO_DOWNLOAD,
  LOCAL_GROUP,
  READY_TO_USE,
  UNKNOWN_GROUP,
  buildModelGroups,
  flattenModelGroups,
  type ModelGroup,
} from "../lib/models/model-groups.ts";
import { presetSpecId } from "../lib/models/huggingface.ts";
import type { ModelSpec, PresetModel, RemoteApiProvider } from "../types/models.ts";

function spec(over: Partial<ModelSpec>): ModelSpec {
  return {
    id: "s1",
    name: "S1",
    author: "a",
    description: "",
    origin: "huggingface",
    type: "llm",
    files: [{ name: "f.gguf", size: 10, downloadUrl: "u" }],
    downloadStatus: "idle",
    downloadProgress: 0,
    downloadedBytes: 0,
    totalBytes: 10,
    ...over,
  };
}

function preset(over: Partial<PresetModel> = {}): PresetModel {
  return {
    id: "p1",
    name: "P1",
    author: "a",
    description: "",
    repo: "o/r",
    type: "llm",
    files: [{ name: "p1.gguf", size: 10, downloadUrl: "u", quantization: "Q4_K_M" }],
    ...over,
  };
}

const remote = { id: "r1", name: "R1" } as unknown as RemoteApiProvider;

const off = { downloadedOnly: false, hfOnly: false, grouped: false };
const on = { downloadedOnly: false, hfOnly: false, grouped: true };

describe("models screen grouping", () => {
  it("splits into the two fixed buckets when grouped is off", () => {
    const groups = buildModelGroups({
      specs: [spec({ id: "done", downloadStatus: "completed" }), spec({ id: "mark" })],
      remotes: [remote],
      presets: [preset()],
      filters: off,
    });
    assert.deepEqual(
      groups.map((g) => g.key),
      [READY_TO_USE, AVAILABLE_TO_DOWNLOAD],
    );
    assert.deepEqual(
      groups[0].items,
      [
        { kind: "spec", id: "done" },
        { kind: "remote", id: "r1" },
      ],
    );
    assert.deepEqual(groups[1].items, [
      { kind: "spec", id: "mark" },
      { kind: "preset", id: "p1" },
    ]);
  });

  it("names the buckets and describes the download one", () => {
    const groups = buildModelGroups({
      specs: [spec({ downloadStatus: "completed" })],
      remotes: [],
      presets: [preset()],
      filters: off,
    });
    assert.equal(groups[0].label, "Ready to Use");
    assert.equal(groups[0].description, undefined);
    assert.equal(groups[1].label, "Available to Download");
    assert.equal(groups[1].description, "Use + button to find more models");
  });

  it("drops an empty group rather than rendering a bare header", () => {
    const groups = buildModelGroups({
      specs: [spec({ downloadStatus: "completed" })],
      remotes: [],
      presets: [],
      filters: off,
    });
    assert.deepEqual(
      groups.map((g) => g.key),
      [READY_TO_USE],
    );
  });

  it("groups by model type when grouped is on, with no description", () => {
    const groups = buildModelGroups({
      specs: [
        spec({ id: "llm", downloadStatus: "completed" }),
        spec({ id: "vis", type: "vision" }),
        spec({ id: "local", origin: "local", localPath: "/x" }),
      ],
      remotes: [],
      presets: [preset({ id: "pvis", type: "vision" })],
      filters: on,
    });
    const byKey = new Map(groups.map((g) => [g.key, g.items]));
    assert.deepEqual(byKey.get("llm"), [{ kind: "spec", id: "llm" }]);
    assert.deepEqual(byKey.get("vision"), [
      { kind: "spec", id: "vis" },
      { kind: "preset", id: "pvis" },
    ]);
    // A local model gets its own bucket whatever its type.
    assert.deepEqual(byKey.get(LOCAL_GROUP), [{ kind: "spec", id: "local" }]);
    assert.ok(groups.every((g) => g.description === undefined));
  });

  it("the downloaded filter keeps only completed models", () => {
    const groups = buildModelGroups({
      specs: [
        spec({ id: "done", downloadStatus: "completed" }),
        spec({ id: "busy", downloadStatus: "downloading" }),
      ],
      remotes: [remote],
      presets: [preset()],
      filters: { ...off, downloadedOnly: true, grouped: true },
    });
    assert.deepEqual(groups.flatMap((g) => g.items), [{ kind: "spec", id: "done" }]);
  });

  it("the hf filter drops remote providers and local models", () => {
    const groups = buildModelGroups({
      specs: [
        spec({ id: "hf", downloadStatus: "completed" }),
        spec({ id: "local", origin: "local" }),
      ],
      remotes: [remote],
      presets: [],
      filters: { ...off, hfOnly: true, grouped: true },
    });
    assert.deepEqual(groups.flatMap((g) => g.items), [{ kind: "spec", id: "hf" }]);
  });

  it("a preset already on disk leaves the download bucket", () => {
    const onDisk = spec({
      id: presetSpecId("p1", "p1.gguf"),
      origin: "preset",
      downloadStatus: "completed",
      files: [{ name: "p1.gguf", size: 10, downloadUrl: "u" }],
    });
    const groups = buildModelGroups({
      specs: [onDisk],
      remotes: [],
      presets: [preset()],
      filters: off,
    });
    assert.deepEqual(groups[0].items, [{ kind: "spec", id: presetSpecId("p1", "p1.gguf") }]);
    assert.equal(groups.length, 1);
  });

  it("a downloading preset shows only its card, never a duplicate spec row", () => {
    const specId = presetSpecId("p1", "p1.gguf");
    const downloading = spec({
      id: specId,
      origin: "preset",
      downloadStatus: "downloading",
      files: [{ name: "p1.gguf", size: 10, downloadUrl: "u" }],
    });
    const groups = buildModelGroups({
      specs: [downloading, spec({ id: "bookmark", origin: "huggingface" })],
      remotes: [],
      presets: [preset()],
      filters: off,
    });
    assert.deepEqual(groups[0].items, [
      { kind: "spec", id: "bookmark" },
      { kind: "preset", id: "p1" },
    ]);
  });

  it("falls back to Unknown for a group key it cannot name", () => {
    const groups = buildModelGroups({
      specs: [spec({ type: undefined as unknown as ModelSpec["type"] })],
      remotes: [],
      presets: [],
      filters: on,
    });
    assert.deepEqual(
      groups.map((g) => g.key),
      [UNKNOWN_GROUP],
    );
  });
});

describe("flattened rows for the one virtualizer", () => {
  const twoGroups: ModelGroup[] = [
    { key: READY_TO_USE, label: "Ready to Use", items: [{ kind: "spec", id: "s1" }] },
    {
      key: AVAILABLE_TO_DOWNLOAD,
      label: "Available to Download",
      items: [
        { kind: "preset", id: "p1" },
        { kind: "spec", id: "h1" },
      ],
    },
  ];

  it("a collapsed group contributes its header and nothing else", () => {
    const rows = flattenModelGroups(twoGroups, {});
    assert.deepEqual(rows.map((r) => r.key), [READY_TO_USE, AVAILABLE_TO_DOWNLOAD]);
    assert.ok(rows.every((r) => r.kind === "group"));
  });

  it("an expanded group interleaves its cards straight after its header", () => {
    const rows = flattenModelGroups(twoGroups, { [AVAILABLE_TO_DOWNLOAD]: true });
    assert.deepEqual(rows.map((r) => r.key), [
      READY_TO_USE,
      AVAILABLE_TO_DOWNLOAD,
      `${AVAILABLE_TO_DOWNLOAD}:preset:p1`,
      `${AVAILABLE_TO_DOWNLOAD}:spec:h1`,
    ]);
    assert.deepEqual(
      rows.filter((r) => r.kind === "item").map((r) => r.item),
      [{ kind: "preset", id: "p1" }, { kind: "spec", id: "h1" }],
    );
  });

  it("expanding one group leaves the other's rows out of the list", () => {
    // The whole point: a collapsed group's cards are NOT in the row list, so
    // they are never mounted and cannot re-render on a download tick.
    const rows = flattenModelGroups(twoGroups, { [READY_TO_USE]: true });
    const items = rows.filter((r) => r.kind === "item");
    assert.equal(items.length, 1);
    assert.equal(items[0].key, `${READY_TO_USE}:spec:s1`);
  });

  it("row keys are unique across groups — two groups can hold the same id", () => {
    const rows = flattenModelGroups(
      [
        { key: "llm", label: "llm", items: [{ kind: "spec", id: "same" }] },
        { key: "vision", label: "vision", items: [{ kind: "spec", id: "same" }] },
      ],
      { llm: true, vision: true },
    );
    const keys = rows.map((r) => r.key);
    assert.equal(
      new Set(keys).size,
      keys.length,
      `duplicate row key: ${keys.join(", ")}`,
    );
  });

  it("an explicitly closed group stays closed even if the map carries it", () => {
    const rows = flattenModelGroups(twoGroups, { [READY_TO_USE]: false });
    assert.equal(rows.filter((r) => r.kind === "item").length, 0);
  });
});
