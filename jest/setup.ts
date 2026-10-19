/** Global Jest setup (setupFiles): module boundaries every suite shares.
 *
 * Moved here from the repo root to mirror the reference app's harness
 * layout (pocketpal-ai/jest/setup.ts). Everything here is a *module
 * boundary*, not a fixture: the mocks exist so a test can import a module
 * that reaches for a native API without a device, while the shared resets
 * keep one test's recorded calls from leaking into the next one.
 *
 * Stores are deliberately NOT mocked here. The reference swaps all of its
 * MobX singletons for `__mocks__/stores/*` because it constructs them at
 * import time; ours are Zustand factories with injected seams, so a suite
 * drives the real store. Mocks belong in the UI suites that need them.
 */

import {
  resetRouterMock,
  // Aliased to the `mock` prefix: babel-plugin-jest-hoist forbids a factory
  // from closing over an ordinary out-of-scope variable, but allows one whose
  // name starts with `mock`. The object itself is the shared `routerMock`
  // this module exports.
  routerMock as mockRouter,
} from "./router-mock.ts";

jest.mock("uniwind", () => ({
  withUniwind: (component: React.ComponentType<unknown>) => component,
  useResolveClassNames: () => undefined,
  useUniwind: () => ({ theme: "light" }),
  useCSSVariable: (name: unknown) =>
    Array.isArray(name) ? name.map(() => undefined) : undefined,
}));

jest.mock("expo-router", () => {
  const actual = jest.requireActual("expo-router");
  return {
    ...actual,
    // The SAME object every test can import and assert against. The old
    // factory minted fresh jest.fn()s per call, so a test body could never
    // observe a navigation.
    useRouter: () => mockRouter,
    useLocalSearchParams: () => ({}),
    useGlobalSearchParams: () => ({}),
    // usePathname is NOT pinned: the real one reads the router store, which
    // answers "/" when there is no router — the same value a pin gave, and
    // the real one keeps working in the suites that DO navigate.
    useSegments: () => [],
  };
});

jest.mock("expo-constants", () => ({
  default: { expoConfig: {} },
  expoConfig: {},
}));

// @expo/ui is aliased to __mocks__/external/@expo/ui.tsx by jest.config.js;
// no inline factory here, so the stub is one module instead of an empty
// object that crashes on `Host`/`Switch`/`Picker`/`Slider`/`BottomSheet`.