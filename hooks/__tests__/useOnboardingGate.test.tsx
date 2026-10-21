/** The first-run gate hook: what it does with an ARMED destination.
 *
 *  The bug these pin is the button that did nothing: the destination was
 *  spent on dispatch, so a replace the navigator dropped took the user's
 *  intent with it. The hook now keeps the intent armed until the arrival
 *  is OBSERVED, and re-issues the replace while the user is still in the
 *  onboarding flow.
 *
 *  The rule itself is in utils/onboarding-exit.ts; this suite pins what the
 *  hook DOES with each verdict.
 */

import { act, renderHook } from "@testing-library/react-native";

import { useOnboardingGate } from "../useOnboardingGate.ts";
import { useOnboardingStore } from "@/store/onboarding.ts";

/** The path the router is on, and the replace the hook dispatches. Both are
 *  read at CALL time, so the mock factory can be hoisted above them. */
let mockPathname = "/onboarding/done";
let mockReplace: jest.Mock;

jest.mock("expo-router", () => ({
  ...jest.requireActual("expo-router"),
  router: { replace: (...args: unknown[]) => mockReplace(...args) },
  usePathname: () => mockPathname,
}));

describe("useOnboardingGate", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockPathname = "/onboarding/done";
    mockReplace = jest.fn();
    // Hydrated, so the hook's hydrate() short-circuits and no async state
    // update races the assertions.
    useOnboardingStore.setState({ onboarded: true, hydrated: true, exitTo: null });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("re-issues the replace while the user is still in the onboarding flow", () => {
    renderHook(() => useOnboardingGate());

    act(() => {
      void useOnboardingStore.getState().complete("/chat");
    });

    expect(mockReplace).toHaveBeenCalledWith("/chat");

    // The replace landed nowhere (the navigator had not re-admitted the
    // drawer), so the intent stays armed and the hook tries again.
    act(() => {
      jest.advanceTimersByTime(200);
    });

    expect(mockReplace).toHaveBeenCalledTimes(2);
    expect(mockReplace).toHaveBeenLastCalledWith("/chat");
  });

  it("drops the destination when the user leaves the onboarding flow", () => {
    const { rerender } = renderHook(() => useOnboardingGate());

    act(() => {
      void useOnboardingStore.getState().complete("/chat");
    });
    expect(mockReplace).toHaveBeenCalledWith("/chat");

    // The user navigated somewhere else on their own: a stale destination
    // must not hijack that navigation.
    mockPathname = "/settings";
    act(() => {
      rerender(undefined);
    });

    expect(useOnboardingStore.getState().exitTo).toBe(null);
    expect(mockReplace).toHaveBeenCalledTimes(1);
  });

  it("spends the destination once the path matches", () => {
    const { rerender } = renderHook(() => useOnboardingGate());

    act(() => {
      void useOnboardingStore.getState().complete("/chat");
    });
    expect(mockReplace).toHaveBeenCalledWith("/chat");

    mockPathname = "/chat";
    act(() => {
      rerender(undefined);
    });

    expect(useOnboardingStore.getState().exitTo).toBe(null);
  });
});
