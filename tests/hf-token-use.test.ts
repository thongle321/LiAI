/** Which Hugging Face token is actually sent, and the "Use HF Token" switch.
 *
 * A pure function because the model store is a singleton with no injectable
 * storage — the one store that cannot be built in a test — so the testable
 * seam has to sit below it.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { activeHfToken } from "../lib/hf-token.ts";

const saved = { hfToken: "hf_abc", useHfToken: true };

describe("Use HF Token", () => {
  it("sends the stored token when the switch is on", () => {
    assert.equal(activeHfToken(saved), "hf_abc");
  });

  it("sends nothing when the switch is off", () => {
    // The point of the switch: park a token that is causing 401s without
    // throwing it away — the store keeps it, the request does not send it.
    assert.equal(activeHfToken({ ...saved, useHfToken: false }), null);
  });

  it("is null with no token saved, either way", () => {
    assert.equal(activeHfToken({ hfToken: null, useHfToken: true }), null);
    assert.equal(activeHfToken({ hfToken: null, useHfToken: false }), null);
  });

  it("lets an explicit token override the switch", () => {
    // A caller passing a token means it, whatever the global switch says.
    assert.equal(
      activeHfToken({ ...saved, useHfToken: false }, "hf_explicit"),
      "hf_explicit",
    );
  });

  it("falls through to the switch when the override is empty", () => {
    // "" is what a caller passes for "no token given", so it must not be
    // treated as a token and sent.
    assert.equal(activeHfToken({ ...saved, useHfToken: false }, ""), null);
    assert.equal(activeHfToken(saved, ""), "hf_abc");
  });
});
