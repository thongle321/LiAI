import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { toWireMessages } from "../lib/inference/remote-engine.ts";
import { remoteCapsCanSeeImages } from "../lib/inference/mmproj.ts";
import type { CompletionRequest } from "../lib/inference/engine.ts";
import type { RemoteCaps } from "../types/models.ts";

// vision-series 04: remote vision — the /props probe's supportsVision gets
// its consumer, and the remote engine sends real OpenAI content arrays.

const request = (over: Partial<CompletionRequest> = {}): CompletionRequest => ({
  messages: [
    { role: "user", content: "hello" },
    { role: "assistant", content: "hi" },
    { role: "user", content: "what is this?" },
  ],
  ...over,
});

describe("toWireMessages (remote request builder)", () => {
  it("sends a content ARRAY with the data URIs on the last user message", () => {
    const wire = toWireMessages(
      request({ imageDataUris: ["data:image/jpeg;base64,AA", "data:image/jpeg;base64,BB"] }),
    );
    assert.deepEqual(wire[0].content, "hello", "older turns stay plain strings");
    assert.deepEqual(wire[1].content, "hi");
    assert.deepEqual(wire[2].content, [
      { type: "text", text: "what is this?" },
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,AA" } },
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,BB" } },
    ]);
  });

  it("is unchanged when no images ride the turn", () => {
    const wire = toWireMessages(request());
    assert.deepEqual(
      wire.map((m) => m.content),
      ["hello", "hi", "what is this?"],
      "text-only requests are byte-identical to before",
    );
  });
});

describe("remoteCapsCanSeeImages", () => {
  const caps: Record<string, RemoteCaps> = {
    "p1": { reachable: true, checkedAt: 1, model: "m", supportsVision: true },
    "p2": { reachable: true, checkedAt: 1, model: "m", supportsVision: false },
    "p3": { reachable: true, checkedAt: 1, model: "m" },
  };

  it("is true only when the ACTIVE remote provider's probe says vision", () => {
    assert.equal(remoteCapsCanSeeImages(caps, "remote-p1", "remote"), true);
    assert.equal(remoteCapsCanSeeImages(caps, "remote-p2", "remote"), false, "probe said no");
    assert.equal(remoteCapsCanSeeImages(caps, "remote-p3", "remote"), false, "probe absent");
    assert.equal(remoteCapsCanSeeImages(caps, "remote-ghost", "remote"), false, "no caps");
  });

  it("never fires for local or no active model", () => {
    assert.equal(remoteCapsCanSeeImages(caps, "v1", "local"), false);
    assert.equal(remoteCapsCanSeeImages(caps, null, "remote"), false);
  });
});

describe("the remote capability reaches every surface", () => {
  it("the composer hook ORs the local and remote rules", () => {
    const src = readFileSync("hooks/useMultimodalAvailable.ts", "utf8");
    assert.match(src, /remoteCapsCanSeeImages/, "remote branch present");
    assert.match(src, /specCanSeeImages/, "local branch kept");
  });

  it("the send gate covers remote too", () => {
    const src = readFileSync("store/chat/send.ts", "utf8");
    assert.match(src, /remoteCapsCanSeeImages/, "the strip knows remote vision");
  });

  it("the turn forwards data URIs for the remote engine", () => {
    const src = readFileSync("lib/chat/turn.ts", "utf8");
    assert.match(src, /imageDataUris/, "data URIs reach the engine options");
  });
});
