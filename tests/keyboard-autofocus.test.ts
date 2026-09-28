/** The autoFocus rule, enforced across every input in the app.
 *
 * Rule: a field auto-focuses only when it is the PRIMARY field its screen
 * opens with (you opened search, so search is focused). A field nested
 * inside a sheet or modal, or a secureTextEntry field, never auto-focuses:
 * raising a secure keyboard unbidden is aggressive, and a nested field
 * stealing focus fights the surface that just animated in.
 *
 * This lives as a source scan rather than a runtime helper because a
 * one-line predicate nobody needs is worse than no predicate, while this
 * form cannot drift: a new autoFocus fails here until it is a conscious,
 * listed decision. Same pattern as tests/touch-targets.test.ts.
 *
 * Run: node --test tests/keyboard-autofocus.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["app", "components"];

/** Files allowed to auto-focus, and the field each is expected to be. */
const ALLOWED = new Map<string, string[]>([
  ["app/(drawer)/(tabs)/chat.tsx", ["in-conversation search"]],
  ["components/VisionOverlays.tsx", ["vision draft input (gated on modelReady)"]],
  ["components/models/HFModelSearch.tsx", ["model search box"]],
  ["components/chat/SessionList.tsx", ["new-conversation title"]],
]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/** Each TextInput's own prop block, so props of a sibling input (or of the
 * next element) are never read as this input's. */
function inputTags(source: string): string[] {
  const tags: string[] = [];
  let from = 0;
  for (;;) {
    const start = source.indexOf("<TextInput", from);
    if (start === -1) return tags;
    const end = source.indexOf("/>", start);
    tags.push(source.slice(start, end === -1 ? source.length : end));
    from = end === -1 ? source.length : end;
  }
}

describe("autoFocus policy", () => {
  it("no secure or nested field auto-focuses", () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of sourceFiles(root)) {
        for (const tag of inputTags(readFileSync(file, "utf8"))) {
          if (!tag.includes("autoFocus")) continue;
          if (tag.includes("secureTextEntry")) {
            offenders.push(`${file}: secureTextEntry field auto-focuses`);
          }
        }
      }
    }
    assert.deepEqual(offenders, []);
  });

  it("every auto-focusing field is a listed primary field", () => {
    const unlisted: string[] = [];
    for (const root of ROOTS) {
      for (const file of sourceFiles(root)) {
        const rel = file.replace(/\\/g, "/");
        const tags = inputTags(readFileSync(file, "utf8")).filter((t) =>
          t.includes("autoFocus"),
        );
        if (tags.length === 0) continue;
        if (!ALLOWED.has(rel)) {
          unlisted.push(`${rel}: auto-focuses but is not a listed primary field`);
          continue;
        }
        // One auto-focus per listed file: a second one is a new decision.
        if (tags.length > 1) {
          unlisted.push(
            `${rel}: ${tags.length} auto-focusing fields, expected 1 (${ALLOWED.get(rel)!.join(", ")})`,
          );
        }
      }
    }
    assert.deepEqual(unlisted, []);
  });

  it("does not lock an input's enter key to a send it cannot perform", () => {
    // A multiline input's Return inserts a newline, so onSubmitEditing never
    // fires: the handler is dead code that implies Enter sends.
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of sourceFiles(root)) {
        for (const tag of inputTags(readFileSync(file, "utf8"))) {
          if (tag.includes("onSubmitEditing") && !tag.includes("multiline={false}")) {
            offenders.push(`${file}: onSubmitEditing on a multiline field`);
          }
        }
      }
    }
    assert.deepEqual(offenders, []);
  });
});
