import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  pushFrame,
  clampWatchInterval,
  WATCH_INTERVAL_MIN_MS,
  WATCH_INTERVAL_MAX_MS,
  WATCH_INTERVAL_DEFAULT_MS,
} from "../lib/vision-watch.ts";
import { createVoiceStore } from "../store/voice.ts";
import { MAX_IMAGES } from "../lib/chat/attachments.ts";

// vision-series 05: watch mode = continuous CAPTURE into a rolling buffer,
// inference ONLY when the user asks. The reference app's auto-send loop is
// rejected; its capture mechanics are what this pins.

const memoryStorage = () => {
  const mem = new Map<string, string>();
  return {
    getItem: async (k: string) => mem.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      mem.set(k, v);
    },
    removeItem: async (k: string) => {
      mem.delete(k);
    },
  };
};

describe("pushFrame — the rolling buffer", () => {
  it("ages out the oldest past the cap — a stale frame is never the whole answer", () => {
    let buf: string[] = [];
    for (const f of ["a", "b", "c", "d", "e", "f"]) buf = pushFrame(buf, f, 5);
    assert.deepEqual(buf, ["b", "c", "d", "e", "f"]);
  });

  it("caps at the per-turn image limit", () => {
    let buf: string[] = [];
    for (let i = 0; i < MAX_IMAGES + 2; i++) buf = pushFrame(buf, `f${i}`, MAX_IMAGES);
    assert.equal(buf.length, MAX_IMAGES);
  });
});

describe("clampWatchInterval", () => {
  it("clamps to 500–5000 ms, junk falls to the 1000 ms default", () => {
    assert.equal(clampWatchInterval(100), WATCH_INTERVAL_MIN_MS);
    assert.equal(clampWatchInterval(9999), WATCH_INTERVAL_MAX_MS);
    assert.equal(clampWatchInterval(NaN), WATCH_INTERVAL_DEFAULT_MS);
    assert.equal(clampWatchInterval(1500), 1500);
  });
});

describe("the interval persists as a USER setting (never a profile)", () => {
  it("voice store defaults, clamps, and round-trips it", async () => {
    const storage = memoryStorage();
    const store = createVoiceStore(storage);
    assert.equal(store.getState().watchIntervalMs, WATCH_INTERVAL_DEFAULT_MS);
    store.getState().setWatchIntervalMs(100);
    assert.equal(store.getState().watchIntervalMs, WATCH_INTERVAL_MIN_MS, "clamped");
    const again = createVoiceStore(storage);
    await again.getState().load();
    assert.equal(again.getState().watchIntervalMs, WATCH_INTERVAL_MIN_MS, "round-trip");
  });
});

describe("the loop captures but NEVER infers by itself", () => {
  it("snapshots on a timer into the buffer — no send, no ask, no chat store", () => {
    const src = readFileSync("hooks/useWatchMode.ts", "utf8");
    assert.match(src, /setInterval/);
    assert.match(src, /takeSnapshot/);
    assert.match(src, /pushFrame/);
    assert.match(src, /clearInterval/, "the loop halts on cleanup");
    assert.doesNotMatch(
      src,
      /askAboutFrame|useChatStore|chatStore\.|\.send\(/,
      "ZERO auto-inference — capture only",
    );
  });

  it("the ask path can read buffered frames and still falls back to the snapshot", () => {
    const src = readFileSync("hooks/useVisionTurn.ts", "utf8");
    assert.match(src, /getBufferedFrames/, "buffered frames provider wired");
    assert.match(src, /buffered\.length > 0/, "buffer wins when non-empty");
  });
});
