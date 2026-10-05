/** Store-subscription guards: components must subscribe narrowly.
 *
 * A bare useXStore() subscribes to the whole store, so ANY write (e.g. a
 * download-progress tick, a draft keystroke) re-renders the subscriber.
 * The canonical with-zustand shape is a field selector for stable values
 * and useShallow for read sets that move together. Actions are
 * referentially stable, so they subscribe alone.
 *
 * Run: node --test tests/store-subscriptions.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");

function files(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(path.join(ROOT, dir))) {
    const rel = `${dir}/${entry}`;
    const st = statSync(path.join(ROOT, rel));
    if (st.isDirectory()) out.push(...files(rel));
    else if (/\.tsx?$/.test(entry)) out.push(rel);
  }
  return out;
}

const SCOPES = ["app", "components", "hooks"];
const STORES = [
  "useModelStore",
  "useInference",
  "useSearch",
  "useChatStore",
  "useModelsUi",
];

describe("store subscriptions", () => {
  it("never subscribes to a whole store", () => {
    // Bare useXStore() re-renders on every write to that store. Field
    // selectors and useShallow read sets are the allowed shapes;
    // .getState() reads (non-reactive, events/effects) are untouched.
    for (const scope of SCOPES) {
      for (const file of files(scope)) {
        const src = readFileSync(path.join(ROOT, file), "utf8");
        for (const store of STORES) {
          assert.doesNotMatch(
            src,
            new RegExp(`\\b${store}\\(\\)`),
            `${file} must not call ${store}() bare — select fields or a useShallow set`,
          );
        }
      }
    }
  });

  it("reads multi-field sets through useShallow", () => {
    // A selector returning a fresh object literal re-renders every store
    // write unless wrapped: useShallow(s => ({...})) is the guard.
    for (const scope of SCOPES) {
      for (const file of files(scope)) {
        const src = readFileSync(path.join(ROOT, file), "utf8");
        for (const m of src.matchAll(
          /= (\w+)\(\s*\(s\) => \(\{\s*[\s\S]*?\s*\}\)\s*\)/g,
        )) {
          assert.ok(
            m[1] === "useShallow" ||
              src.includes(`useShallow((s) => ({`),
            `${file} returns an object literal from a selector without useShallow`,
          );
        }
      }
    }
  });
});
