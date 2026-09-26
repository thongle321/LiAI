/** Local pure talents: datetime + calculate + untrusted wrapper (TDD).
 * Run: node --test frontend/tests/local-talents.test.ts */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { calculate, localTime } from "../lib/agent/talents.ts";
import { fenceUntrusted } from "../lib/agent/untrusted.ts";

describe("localTime", () => {
  it("returns an ISO-8601 datetime string", () => {
    const out = localTime({});
    assert.match(
      out,
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    );
  });

  it("rejects an unknown timezone with a message", () => {
    assert.match(localTime({ timezone: "Mars/Olympus" }), /unknown|invalid|error/i);
  });
});

describe("calculate", () => {
  it("evaluates basic arithmetic", () => {
    assert.equal(calculate({ expression: "2 + 3 * 4" }), "2 + 3 * 4 = 14");
  });

  it("never throws on hostile input", () => {
    assert.match(
      calculate({ expression: "(0).constructor.constructor('x')" }),
      /cannot|invalid|error/i,
    );
    assert.match(calculate({ expression: "" }), /missing|empty/i);
    assert.match(calculate({}), /missing|empty/i);
  });

  it("rejects overlong expressions without evaluating", () => {
    assert.match(calculate({ expression: "1+".repeat(200) }), /too long/i);
  });
});

describe("fenceUntrusted", () => {
  it("wraps third-party text as quoted data", () => {
    const out = fenceUntrusted("OPEN ME");
    assert.ok(out.includes("OPEN ME"));
    assert.ok(out.length > "OPEN ME".length);
  });
});
