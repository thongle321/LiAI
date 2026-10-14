/** The shared pickable-model list.
 * Run: node --test tests/chat-models.test.ts
 *
 * Two menus read this (the header menu and each message's "Regenerate
 * with…"), so it is pinned here rather than in either surface: if the two
 * ever disagreed about which models exist, the bug would show up as one
 * menu offering a model the other hides. */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { pickableModels, providerHost } from "../lib/chat/models.ts";

// A realistic ModelSpec slice. `files` and `origin` are load-bearing, not
// decoration: readiness is the engine's `isLocalModelReady`, which requires
// a file on disk and rejects a remote provider's spec. A fixture without
// them describes a model that could never be loaded, and would pass here
// while the composer said "Model not loaded.".
const dl = (id: string, status = "completed") => ({
  id,
  name: `model ${id}`,
  downloadStatus: status,
  origin: "huggingface" as const,
  files: [{ name: `${id}.gguf` }],
});

describe("pickableModels", () => {
  it("lists only models that finished downloading", () => {
    const out = pickableModels(
      [dl("a"), dl("b", "downloading"), dl("c", "failed"), dl("d")],
      [],
      null,
    );
    assert.deepEqual(out.map((m) => m.id), ["a", "d"]);
  });

  it("marks exactly the active model", () => {
    const out = pickableModels([dl("a"), dl("b")], [], "b");
    assert.deepEqual(out.map((m) => m.active), [false, true]);
  });

  it("marks nothing active when no model is selected", () => {
    const out = pickableModels([dl("a")], [], null);
    assert.deepEqual(out.map((m) => m.active), [false]);
  });

  it("labels a remote entry with its host", () => {
    const out = pickableModels([], [{ id: "r", name: "qwen", baseUrl: "https://api.example.com/v1" }], "r");
    assert.deepEqual(out, [{ id: "r", name: "qwen", host: "api.example.com", active: true }]);
  });

  it("puts local models before remote ones", () => {
    const out = pickableModels(
      [dl("a")],
      [{ id: "r", name: "qwen", baseUrl: "https://api.example.com/v1" }],
      null,
    );
    assert.deepEqual(out.map((m) => m.id), ["a", "r"]);
  });

  it("is empty when nothing is available, so the submenu is omitted", () => {
    assert.deepEqual(pickableModels([dl("a", "downloading")], [], null), []);
  });

  it("hides a completed spec that has no file to load", () => {
    // The engine cannot load it, so the menu must not offer it — the two
    // used to disagree here and the composer was the one that lost.
    const headless = { ...dl("a"), files: [] };
    assert.deepEqual(pickableModels([headless], [], null), []);
  });
});

describe("providerHost", () => {
  it("extracts the host from a base URL", () => {
    assert.equal(providerHost("https://api.example.com/v1"), "api.example.com");
    assert.equal(providerHost("http://localhost:1234/v1"), "localhost:1234");
  });

  it("falls back to the raw string rather than throwing", () => {
    // A label is not worth failing a menu over.
    assert.equal(providerHost("not a url"), "not a url");
  });
});