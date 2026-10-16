/**
 * Route smoke test: prove the router testing harness and the global router
 * mock actually work together.
 *
 * `jest/setup.ts` swaps `useRouter()` for the stable `routerMock` object, so
 * a component test can assert navigation. `renderRouter` instead drives
 * Expo Router's real router store over an inline route tree, which is the
 * seam for route-level behaviour without putting a test file under `app/`
 * (Expo Router treats recognized extensions there as routes).
 */

import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { Link, useRouter } from "expo-router";
import { fireEvent, renderRouter } from "expo-router/testing-library";

import { routerMock } from "./router-mock.ts";

/** The inline trees below are not part of the app's generated route union
 *  (expo-router types `href` from `.expo/types`), so their names have to be
 *  cast. Kept in one place so the cast has one explanation. */
const route = (name: string) => name as never;

describe("expo-router testing harness", () => {
  it("renders the initial inline route", async () => {
    await renderRouter({
      index: () => <Text>route smoke</Text>,
    });
    expect(screen.getByText("route smoke")).toBeTruthy();
  });

  it("navigates a Link press to the next inline route", async () => {
    await renderRouter({
      index: () => (
        <Link href={route("/second")}>
          <Text>go to second</Text>
        </Link>
      ),
      second: () => <Text>second route</Text>,
    });
    fireEvent.press(screen.getByText("go to second"));
    // The real router store, not the mock: route behaviour is observable.
    expect(screen.getByText("second route")).toBeTruthy();
  });
});

describe("the global router mock", () => {
  it("is the router a component gets, and records its navigation", () => {
    // No renderRouter here: this is the plain component seam, where
    // jest/setup.ts's `useRouter` override hands out the shared mock.
    const First = () => {
      const router = useRouter();
      return <Text onPress={() => router.push(route("/second"))}>navigate</Text>;
    };
    render(<First />);
    fireEvent.press(screen.getByText("navigate"));
    expect(routerMock.push).toHaveBeenCalledWith("/second");
  });

  it("forgets the previous test's navigation", () => {
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });
});
