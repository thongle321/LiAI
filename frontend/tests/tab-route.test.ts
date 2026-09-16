import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { routeForTab } from "../lib/tabRoute.ts";

void describe("routeForTab", () => {
  void it("keeps chat on the plain chat route", () => {
    assert.equal(routeForTab("chat"), "/chat");
  });

  void it("links vision to the standalone vision route", () => {
    assert.equal(routeForTab("vision"), "/vision");
  });
});
