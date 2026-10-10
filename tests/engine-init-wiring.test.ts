/** Regression pin for audit finding 1: the production wiring of `init`.
 *
 * `EngineManager.ensure()` only reloads the model when the slot key
 * changes, and the key is built from the `init` argument. The arg has to
 * be passed from the ONE resolver the loader itself uses — when the call
 * sites pass nothing (as they once did), every inference-settings change
 * silently does nothing and the context-full banner's reload is a no-op.
 * The manager's own tests pass `init` explicitly, so they cannot see this;
 * a source scan of the production file is the seam that can.
 *
 * Run: node --test tests/engine-init-wiring.test.ts */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../store/chat/index.ts", import.meta.url),
  "utf8",
);

describe("engine init wiring (production)", () => {
  it("defines one resolveInit() that builds the loader's params", () => {
    assert.match(
      source,
      /async function resolveInit\(\)[\s\S]*?Promise<LlamaInitParams>/,
      "store/chat/index.ts must expose ONE async resolveInit(): LlamaInitParams",
    );
  });

  it("the loader builds its context from resolveInit()", () => {
    const loads = source.match(/await resolveInit\(\)/g) ?? [];
    assert.ok(
      loads.length >= 3,
      `expected resolveInit() at the loader and BOTH ensure() call sites, saw ${loads.length}`,
    );
    assert.doesNotMatch(
      source,
      /loadLlamaContext\([^)]*\{\s*n_ctx/,
      "the loader must not hand-build params beside resolveInit() — the two would drift",
    );
  });

  it("both ensure() call sites pass the init argument", () => {
    // Three-arg form: ensure(source, mmprojPath, init). Any ensure() that
    // omits the third arg reuses a stale context when settings changed.
    const ensures = source.match(/getManager\(\)\.ensure\(/g) ?? [];
    assert.equal(ensures.length, 2, "reloadLocalEngine + turn ensureEngine");
    const withInit = source.match(
      /getManager\(\)\.ensure\([\s\S]*?await resolveInit\(\)/g,
    ) ?? [];
    assert.equal(
      withInit.length,
      2,
      "every production ensure() must receive the resolved init",
    );
  });
});
