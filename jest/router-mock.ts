/** A stable, assertable `expo-router` mock for Jest.
 *
 * jest.setup.ts wires `useRouter()` to the ONE object exported here, so a
 * test can `import { routerMock }` and assert navigation:
 *
 * ```ts
 * import { routerMock } from "../../../jest/router-mock";
 * fireEvent.press(button);
 * expect(routerMock.push).toHaveBeenCalledWith("/onboarding/model");
 * ```
 *
 * `resetRouterMock()` runs in a global `beforeEach`, so a call recorded by
 * one test can never satisfy an assertion in the next one.
 */

/** Every navigation verb the app calls, as a jest.fn. */
export interface RouterMock {
  push: ReturnType<typeof jest.fn>;
  replace: ReturnType<typeof jest.fn>;
  navigate: ReturnType<typeof jest.fn>;
  back: ReturnType<typeof jest.fn>;
  setParams: ReturnType<typeof jest.fn>;
  dismiss: ReturnType<typeof jest.fn>;
  dismissAll: ReturnType<typeof jest.fn>;
  canGoBack: ReturnType<typeof jest.fn>;
}

export const routerMock: RouterMock = {
  push: jest.fn(),
  replace: jest.fn(),
  navigate: jest.fn(),
  back: jest.fn(),
  setParams: jest.fn(),
  dismiss: jest.fn(),
  dismissAll: jest.fn(),
  canGoBack: jest.fn(() => false),
};

/** Clear every recorded navigation. Called from jest.setup.ts. */
export function resetRouterMock(): void {
  for (const fn of Object.values(routerMock)) {
    fn.mockReset();
  }
  // canGoBack has a non-undefined default; a reset would blank it out.
  routerMock.canGoBack.mockReturnValue(false);
}

export default routerMock;
