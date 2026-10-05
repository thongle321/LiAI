/** Context-window fill maths (G1 banner meter, C4 near-limit warning).
 * Run: node --test tests/context-fill.test.ts
 *
 * Pure on purpose: the functions live in lib/ rather than in the banner
 * component so this suite can load them without react-native. The chat
 * wiring pins read chat.tsx as TEXT (readFileSync) — they assert the
 * screen consumes these helpers, still without importing react-native.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  effectiveNCtx,
  fillPercent,
  isNearLimit,
  NEAR_LIMIT_FILL_PCT,
} from "../lib/chat/context-fill.ts";

describe("fillPercent", () => {
  it("reports the share of the window in use", () => {
    assert.equal(fillPercent(2048, 4096), 50);
    assert.equal(fillPercent(4096, 4096), 100);
  });

  it("rounds to a whole percent", () => {
    assert.equal(fillPercent(1000, 4096), 24);
  });

  it("clamps above 100 rather than rendering a broken meter", () => {
    // A remote endpoint, or a turn counted against a stale window, can
    // report more prompt tokens than the configured size. A 137% meter is
    // a bug report waiting to happen.
    assert.equal(fillPercent(8192, 4096), 100);
    assert.equal(fillPercent(100000, 4096), 100);
  });

  it("clamps below zero rather than rendering a negative meter", () => {
    assert.equal(fillPercent(-5, 4096), 0);
  });

  it("reads 0 when the turn reported no prompt tokens yet", () => {
    assert.equal(fillPercent(undefined, 4096), 0);
    assert.equal(fillPercent(0, 4096), 0);
  });

  it("reads 0 when the window is unset or nonsense, rather than dividing", () => {
    assert.equal(fillPercent(1000, 0), 0);
    assert.equal(fillPercent(1000, -1), 0);
  });

  it("handles a very large window without overflowing into nonsense", () => {
    assert.equal(fillPercent(65536, 131072), 50);
  });
});

describe("effectiveNCtx", () => {
  it("reads the configured window for a local model", () => {
    assert.equal(
      effectiveNCtx({ isRemote: false, localNCtx: 4096, remoteContextLength: undefined }),
      4096,
    );
  });

  it("reads the probed /props window for a remote model (C7)", () => {
    assert.equal(
      effectiveNCtx({ isRemote: true, localNCtx: 4096, remoteContextLength: 32768 }),
      32768,
    );
  });

  it("stays unknown until a probe lands — never falls back to the local setting", () => {
    // PocketPal's effectiveNCtx gate: a remote window is known only once
    // its /props contextLength exists. Guessing the local nCtx for a
    // remote thread would divide by a number that belongs to another
    // engine.
    assert.equal(
      effectiveNCtx({ isRemote: true, localNCtx: 4096, remoteContextLength: undefined }),
      undefined,
    );
    assert.equal(
      effectiveNCtx({ isRemote: true, localNCtx: 4096, remoteContextLength: 0 }),
      undefined,
    );
    assert.equal(
      effectiveNCtx({ isRemote: true, localNCtx: 4096, remoteContextLength: -1 }),
      undefined,
    );
    assert.equal(
      effectiveNCtx({ isRemote: true, localNCtx: 4096, remoteContextLength: NaN }),
      undefined,
    );
  });
});

describe("isNearLimit", () => {
  it("pins the PocketPal threshold (bannerVariantResolver.ts:3)", () => {
    assert.equal(NEAR_LIMIT_FILL_PCT, 80);
  });

  it("fires at the threshold, not before", () => {
    assert.equal(isNearLimit(3200, 4096), false); // ~78%
    assert.equal(isNearLimit(3277, 4096), true); // ~80%
    assert.equal(isNearLimit(4096, 4096), true); // full counts as near
    assert.equal(isNearLimit(5000, 4096), true); // overflow clamps to 100
  });

  it("never warns blind: unknown occupancy or unknown window is not evidence", () => {
    assert.equal(isNearLimit(undefined, 4096), false);
    assert.equal(isNearLimit(3277, undefined), false);
    assert.equal(isNearLimit(3277, 0), false);
    assert.equal(isNearLimit(3277, -1), false);
  });
});

describe("chat wiring (C4)", () => {
  const chat = readFileSync("app/(drawer)/(tabs)/chat.tsx", "utf8");

  it("divides the corrected figure by the effective window", () => {
    // Occupancy is 05's figure, not a second calculation…
    assert.match(chat, /fillPercent\(newestAssistant\?\.usage\?\.promptTokens/);
    // …and the denominator resolves remote n_ctx from the C7 caps.
    assert.match(chat, /effectiveNCtx\(/);
    assert.match(chat, /contextLength/, "remote denominator comes from /props caps");
  });

  it("warns through the shared threshold, with full-banner precedence", () => {
    assert.match(chat, /isNearLimit\(/, "the threshold lives in one place");
    assert.match(
      chat,
      /contextFullTurnId \?\? nearLimitTurnId/,
      "an already-full thread keeps today's banner, never the warning instead",
    );
  });
});
