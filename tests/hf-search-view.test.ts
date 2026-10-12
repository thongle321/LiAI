/** The HF search view's two behaviours a source scan can pin: the
 * no-results state and the duplicate-page guard.
 *
 * Run: node --test tests/hf-search-view.test.ts
 *
 * WHY A SOURCE SCAN: the view mounts native components (Sheet, FlatList,
 * Lucide icons), so the runner cannot render it — the repo's standing
 * pattern for behaviour that must not drift.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const SOURCE = readFileSync(
  path.join(
    import.meta.dirname,
    "..",
    "components",
    "models",
    "HFSearchView.tsx",
  ),
  "utf8",
);

describe("HF search view", () => {
  it("says so when a search finds nothing", () => {
    assert.match(
      SOURCE,
      /ListEmptyComponent/,
      "a blank panel under a populated search bar reads as a hung request",
    );
    assert.match(SOURCE, /No models found/);
  });

  it("drops a duplicate page request inside the guard window", () => {
    assert.match(
      SOURCE,
      /const PAGE_GUARD_MS = 1000/,
      "the reference's window is 1000ms (SearchView.tsx:41-51)",
    );
    assert.match(SOURCE, /lastPageCall/, "the guard is a ref, not state");
  });
});
