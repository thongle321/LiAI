/** The armed-destination rule (Jest).
 *
 * The gate's destination is spent only when the user has arrived, is
 * dropped when they have left the onboarding flow, and is re-issued while
 * they are still in it. A stale intent that hijacked a later navigation
 * would be worse than the dead button this replaces.
 */

import { decideOnboardingExit } from "../onboarding-exit";

describe("decideOnboardingExit", () => {
  it("spends the destination once the user has arrived", () => {
    expect(decideOnboardingExit("/chat", "/chat")).toBe("arrive");
    expect(decideOnboardingExit("/models", "/models")).toBe("arrive");
  });

  it("re-issues the navigation while the user is still in the flow", () => {
    expect(decideOnboardingExit("/onboarding/done", "/chat")).toBe("replace");
    expect(decideOnboardingExit("/onboarding/welcome", "/models")).toBe(
      "replace",
    );
    expect(decideOnboardingExit("/onboarding/model", "/chat")).toBe("replace");
  });

  it("abandons the destination once the user has left the flow", () => {
    // A stale destination must not hijack the navigation the user just
    // made on purpose.
    expect(decideOnboardingExit("/settings", "/chat")).toBe("abandon");
    expect(decideOnboardingExit("/", "/chat")).toBe("abandon");
  });
});
