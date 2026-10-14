/** Read a repository file by its path from the repo root.
 *
 * Source-text guards (`expect(src).toMatch(...)`) are a last resort, but the
 * few that remain are real invariants. They used to `readFileSync` a path
 * relative to the process cwd, which silently broke whenever Jest ran from
 * anywhere but the repo root. Anchoring to this file's own location makes the
 * read independent of where the suite was launched.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

/** Repo root: this file lives at <root>/jest/source.ts. */
const ROOT = path.resolve(__dirname, "..");

/** Read a repo file given its path from the root, e.g. `store/chat/send.ts`. */
export function readSource(relativePath: string): string {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}
