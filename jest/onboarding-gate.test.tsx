/**
 * The first-run gate is enforced by the navigator, not by a Redirect.
 *
 * A Redirect lives in app/index.tsx, so it can only fire once that screen
 * mounts. A deep link (`liai://models`, `liai://chat?message=…`) resolves its
 * target route directly and never mounts index — the Redirect never runs and
 * the user lands on a fully provisioned app that has skipped onboarding.
 *
 * `Stack.Protected` removes the guarded screens from the navigator instead:
 * with no drawer to resolve to, the router falls back to the initial route,
 * which is index, which redirects to onboarding.
 *
 * This is a structural assertion rather than a behavioural one because the
 * mechanism lives in the navigator's screen tree, not in a component we can
 * render in isolation. It pins the shape so the wrapper cannot be dropped
 * silently.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const layout = readFileSync(join(__dirname, "..", "app", "_layout.tsx"), "utf8");

describe("first-run gate (D1-1)", () => {
  it("wraps the drawer in Stack.Protected so a deep link cannot skip onboarding", () => {
    expect(layout).toMatch(/Stack\.Protected/);
    expect(layout).toMatch(/guard=\{onboarded\}/);
  });

  it("reads the onboarding flag from storage, not from a constant", () => {
    expect(layout).toMatch(/isOnboarded\(\)/);
  });

  it("keeps the index screen as the fallback the router resolves to", () => {
    // index is the initial route; with the drawer hidden the navigator has
    // nothing else to show, so it falls back to index, which redirects.
    expect(layout).toMatch(/name="index"/);
  });
});
