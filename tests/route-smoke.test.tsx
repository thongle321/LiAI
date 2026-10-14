/**
 * Route smoke test: prove the router testing harness can render an inline
 * route tree without touching the real `app/` tree. Actual route behavior is
 * tested by importing route components where safe; this file owns the
 * harness seam only.
 */

import { Text } from "react-native";
import { renderRouter, screen } from "expo-router/testing-library";

describe("expo-router testing harness", () => {
  it("renders the initial inline route", async () => {
    await renderRouter({
      index: () => <Text>route smoke</Text>,
    });
    expect(screen.getByText("route smoke")).toBeTruthy();
  });
});