/** Provider helper tests. Run: node --test frontend/tests/model-providers.test.ts */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { isProviderActive } from "../lib/model-providers.ts";

describe("isProviderActive", () => {
  it("matches only the remote id for that provider", () => {
    assert.equal(isProviderActive("remote-abc", "abc"), true);
    assert.equal(isProviderActive("remote-abc", "other"), false);
    assert.equal(isProviderActive("local-xyz", "xyz"), false);
    assert.equal(isProviderActive(null, "abc"), false);
  });
});
