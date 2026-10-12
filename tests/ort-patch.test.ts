/** The onnxruntime-react-native patch must survive a fresh install.
 * Run: node --test tests/ort-patch.test.ts
 *
 * Two defects in onnxruntime-react-native@1.24.3 are patched, and both
 * only bite at BUILD time — a dropped patch fails as an opaque Gradle
 * error minutes into a cold build, so pin the patch itself.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const PATCH = "patches/onnxruntime-react-native+1.24.3.patch";
const patch = readFileSync(PATCH, "utf8");
const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts: Record<string, string>;
};

describe("onnxruntime-react-native patch", () => {
  it("is applied by postinstall", () => {
    // Without this the patch is dead weight in the repo.
    assert.match(pkg.scripts.postinstall ?? "", /patch-package/);
  });

  it("patches the CMakeLists for 16 KB page alignment", () => {
    assert.match(patch, /android\/CMakeLists\.txt/);
    assert.match(patch, /max-page-size=16384/);
  });

  it("patches build.gradle for the missing VersionNumber import", () => {
    // Upstream calls VersionNumber.parse() at build.gradle:250 without ever
    // importing it, so an unpatched install dies at configuration time
    // with "Could not get unknown property 'VersionNumber'".
    assert.match(patch, /android\/build\.gradle/);
    assert.match(patch, /\+import org\.gradle\.util\.internal\.VersionNumber/);
  });

  it("covers both files in one patch", () => {
    const diffs = patch.match(/^diff --git /gm) ?? [];
    assert.equal(diffs.length, 2, "one hunk each for CMakeLists.txt and build.gradle");
  });

  it("ends with a newline so git apply does not reject it as corrupt", () => {
    assert.ok(patch.endsWith("\n"));
  });
});