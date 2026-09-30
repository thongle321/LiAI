/** Provider helper tests. Run: node --test frontend/tests/model-providers.test.ts */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  activeGroupId,
  formatParams,
  isProviderActive,
} from "../lib/model-providers.ts";

describe("isProviderActive", () => {
  it("matches only the remote id for that provider", () => {
    assert.equal(isProviderActive("remote-abc", "abc"), true);
    assert.equal(isProviderActive("remote-abc", "other"), false);
    assert.equal(isProviderActive("local-xyz", "xyz"), false);
    assert.equal(isProviderActive(null, "abc"), false);
  });
});

describe("activeGroupId", () => {
  it("resolves any active model to the Ready section", () => {
    assert.equal(activeGroupId("local-xyz"), "ready");
    assert.equal(activeGroupId("remote-abc"), "ready");
    assert.equal(activeGroupId(null), null);
  });
});

describe("formatParams", () => {
  it("compacts to M/B", () => {
    assert.equal(formatParams(135_000_000), "135M");
    assert.equal(formatParams(500_000_000), "500M");
    assert.equal(formatParams(1_000_000_000), "1B");
    assert.equal(formatParams(2_000_000_000), "2B");
  });
});
