import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { routeForTab } from "../lib/tabRoute.ts";

void describe("routeForTab", () => {
  void it("keeps chat on the plain chat route", () => {
    assert.equal(routeForTab("chat"), "/chat");
  });

  void it("carries the vision intent as a query param", () => {
    assert.equal(routeForTab("vision"), "/chat?tab=vision");
  });
});
