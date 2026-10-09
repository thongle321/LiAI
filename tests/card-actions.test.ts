/** Model-card action row (PocketParity: pocketpal-ai ModelCard.tsx:377-586).
 *
 * Run: node --test tests/card-actions.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { cardActions, statusDotState } from "../lib/models/card-actions.ts";
import type { ModelDownloadStatus } from "../types/models.ts";

const done: ModelDownloadStatus = "completed";
const idle: ModelDownloadStatus = "idle";

describe("model card action row", () => {
  it("a downloaded, unloaded card offers Load, Settings, Delete, expand", () => {
    assert.deepEqual(
      cardActions({ status: done, isActive: false, downloadable: false }),
      ["load", "settings", "delete", "expand"],
    );
  });

  it("the loaded card's primary action becomes Offload", () => {
    assert.equal(
      cardActions({ status: done, isActive: true, downloadable: false })[0],
      "offload",
    );
  });

  it("a bookmark offers Download and Remove — never Delete", () => {
    const actions = cardActions({
      status: idle,
      isActive: false,
      downloadable: true,
    });
    assert.deepEqual(actions, ["download", "settings", "remove", "expand"]);
    assert.ok(!actions.includes("delete"), "no file on disk to delete");
  });

  it("a transfer in flight reduces the row to Cancel", () => {
    assert.deepEqual(
      cardActions({ status: "downloading", isActive: false, downloadable: true }),
      ["cancel"],
    );
    assert.deepEqual(
      cardActions({ status: "paused", isActive: false, downloadable: true }),
      ["cancel"],
    );
  });

  it("the status dot appears only once a file is on disk", () => {
    assert.equal(statusDotState({ status: idle, isActive: false }), null);
    assert.equal(
      statusDotState({ status: "downloading", isActive: false }),
      null,
      "an in-flight download is not yet a model you can load",
    );
    assert.equal(statusDotState({ status: done, isActive: true }), "active");
    assert.equal(statusDotState({ status: done, isActive: false }), "idle");
  });
});
