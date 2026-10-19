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
 * These are structural assertions rather than behavioural ones because the
 * mechanism lives in the navigator's screen tree, not in a component we can
 * render in isolation. It pins the shape so the wrapper cannot be dropped
 * silently. The BEHAVIOUR of the gate — that completing onboarding puts the
 * drawer back and lands the user on a screen — is pinned by
 * jest/onboarding-done.test.tsx, which drives the real navigator.
 */

import { readSource } from "./source.ts";

const layout = readSource("app/_layout.tsx");
const store = readSource("store/onboarding.ts");
const done = readSource("app/onboarding/done.tsx");

describe("first-run gate (D1-1)", () => {
  it("wraps the drawer in Stack.Protected so a deep link cannot skip onboarding", () => {
    expect(layout).toMatch(/Stack\.Protected/);
    expect(layout).toMatch(/guard=\{onboarded\}/);
  });

  it("reads the onboarding flag from storage, not from a constant", () => {
    // The flag is read by the store that owns the gate, not by the layout:
    // the layout holds LIVE state, because a value read once at mount cannot
    // re-open the gate when onboarding completes (the drawer would stay
    // removed from the navigator and the navigation would be dropped).
    expect(store).toMatch(/getItem/);
    expect(store).toMatch(/ONBOARDING_KEY/);
  });

  it("keeps the index screen as the fallback the router resolves to", () => {
    // index is the initial route; with the drawer hidden the navigator has
    // nothing else to show, so it falls back to index, which redirects.
    expect(layout).toMatch(/name="index"/);
  });
});

describe("the gate can re-open (D1-1 follow-up)", () => {
  it("reads the gate from the live store, not from a value seeded at mount", () => {
    // A value seeded once at mount is the bug: `setOnboarded()` wrote
    // AsyncStorage but never told the layout, so the guard stayed closed for
    // the rest of the session and every post-onboarding navigation was
    // aimed at a route the navigator no longer had.
    //
    // The assertion is on the SEEDING, not on the whole file: the root
    // layout is allowed to hold other state, and a blanket ban on useState
    // would fail on work that has nothing to do with the gate.
    expect(layout).toMatch(/useOnboardingGate\(\)/);
    expect(layout).not.toMatch(/useState\([^)]*onboarded/i);
    expect(layout).not.toMatch(/isOnboarded/);
  });

  it("exposes a way to open the gate and record where to go next", () => {
    expect(store).toMatch(/complete:/);
    expect(store).toMatch(/exitTo/);
  });
});

describe("the done screen hands the navigation to the gate", () => {
  it("completes the gate with the destination, not a direct replace", () => {
    // The button must NOT navigate itself. While the gate is closed the chat
    // and models screens are not in the navigator's route names, so a replace
    // fired from the button is aimed at a route the navigator does not have
    // and is dropped — the button did nothing. Recording the destination and
    // letting the root layout navigate, after the guard has re-admitted the
    // screens, is what makes the press land.
    expect(done).toMatch(/complete\(\s*"\/chat"/);
    expect(done).toMatch(/complete\(\s*"\/models"/);
    expect(done).not.toMatch(/router\.replace\(/);
  });
});
