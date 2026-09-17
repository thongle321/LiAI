/** Protocol tests for frontend/lib/vision.ts. Run: node --test frontend/tests/vision.test.ts */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  frameMessage,
  parseServerMessage,
  questionMessage,
  shouldStreamFrames,
  visionSocketUrl,
} from "../lib/vision.ts";

describe("visionSocketUrl", () => {
  it("swaps http for ws and appends the route", () => {
    assert.ok(visionSocketUrl().startsWith("ws://"));
    assert.ok(visionSocketUrl().endsWith("/api/vision/ws"));
  });
});

describe("stream policy", () => {
  it("streams while idle, listening, or speaking, then pauses for an answer", () => {
    assert.equal(shouldStreamFrames("idle"), true);
    assert.equal(shouldStreamFrames("listening"), true);
    assert.equal(shouldStreamFrames("thinking"), false);
    assert.equal(shouldStreamFrames("speaking"), true);
  });
});

describe("message builders", () => {
  it("encodes frames and questions as JSON text", () => {
    assert.deepEqual(JSON.parse(frameMessage("abc")), {
      type: "frame",
      jpeg: "abc",
    });
    assert.deepEqual(JSON.parse(questionMessage("hi?")), {
      type: "question",
      text: "hi?",
    });
  });
});

describe("parseServerMessage", () => {
  it("reads answers", () => {
    const msg = parseServerMessage(
      JSON.stringify({ type: "answer", text: "a chair", session_id: "s" }),
    );
    assert.deepEqual(msg, {
      type: "answer",
      text: "a chair",
      sessionId: "s",
    });
  });

  it("reads captions", () => {
    const msg = parseServerMessage(
      JSON.stringify({ type: "caption", text: "a room", session_id: "s" }),
    );
    assert.deepEqual(msg, {
      type: "caption",
      text: "a room",
      sessionId: "s",
    });
  });

  it("reads error envelopes", () => {
    const msg = parseServerMessage(
      JSON.stringify({ type: "error", error: { code: "x", message: "bad" } }),
    );
    assert.deepEqual(msg, { type: "error", message: "bad" });
  });

  it("ignores junk", () => {
    assert.deepEqual(parseServerMessage("nope{"), { type: "other" });
    assert.deepEqual(parseServerMessage(null), { type: "other" });
    assert.deepEqual(
      parseServerMessage(JSON.stringify({ type: "teleport" })),
      { type: "other" },
    );
  });
});
