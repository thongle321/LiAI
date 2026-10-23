/**
 * The onboarding "You're set" screen: both buttons must land on a screen.
 *
 * In `jest/` rather than beside the route it exercises, because every file
 * under `app/` is a route to Expo Router — see the "keeps app/ to routes"
 * guard in jest/architecture-conventions.test.ts.
 *
 * The bug this pins: the root layout guards the drawer with
 * `Stack.Protected`, so while the gate is closed the `(drawer)` group is
 * NOT in the navigator's route names. Completing onboarding used to write
 * the flag to storage and navigate in the same breath — the guard never
 * reopened, and a replace aimed at a route the navigator does not have is
 * dropped (StackRouter's `getStateForAction` returns null for an unknown
 * payload name, and React Navigation bubbles the unhandled action up). The
 * user pressed the button and nothing happened.
 *
 * The tree below mirrors the app's shape, INCLUDING the groups: the app's
 * chat screen is `app/(drawer)/(tabs)/chat.tsx` and its models screen is
 * `app/(drawer)/models.tsx`, both behind the guarded `(drawer)` group. That
 * matters because expo-router names a navigation action after the
 * DIVERGENCE-level route (expo-router/build/global-state/stateUtils.js),
 * so in production the replace dispatches `name: "(drawer)"` with a nested
 * `params.screen` chain — never `name: "chat"`. A flat tree would prove
 * nothing about the payload the app actually sends.
 *
 * The real store, the real hook and the real done screen are used, so this
 * exercises the production path rather than a copy of it.
 */

import { Text } from "react-native";
import { Stack } from "expo-router";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { renderRouter } from "expo-router/testing-library";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useOnboardingGate } from "@/hooks/useOnboardingGate.ts";
import { useOnboardingStore } from "@/store/onboarding.ts";
import DoneStep from "@/app/onboarding/done.tsx";

import { route } from "./route-cast.ts";

// No jest.mock for AsyncStorage: jest.config.js moduleNameMapper already
// redirects the specifier to __mocks__/external/... (added in d97569a). A
// factory that requires @react-native-async-storage/... would itself be
// re-mapped onto that fake and recurse — the "Maximum call stack" load
// failure this file used to have.

/** Mirrors app/_layout.tsx: the drawer group lives behind `Stack.Protected`,
 *  the onboarding flow outside it. */
function RootLayout() {
  const { onboarded } = useOnboardingGate();
  return (
    <Stack>
      <Stack.Screen name={route("index")} />
      <Stack.Protected guard={onboarded}>
        <Stack.Screen name={route("(drawer)")} />
      </Stack.Protected>
      <Stack.Screen name={route("onboarding")} />
    </Stack>
  );
}

const tree = {
  _layout: RootLayout,
  index: () => <Text>index</Text>,
  "onboarding/_layout": () => <Stack />,
  "onboarding/done": DoneStep,
  "(drawer)/_layout": () => <Stack />,
  "(drawer)/(tabs)/_layout": () => <Stack />,
  "(drawer)/(tabs)/chat": () => <Text>chat screen</Text>,
  "(drawer)/models": () => <Text>models screen</Text>,
};

describe("the onboarding done screen", () => {
  beforeEach(async () => {
    // A first run: no flag on disk, and a gate that starts closed.
    await AsyncStorage.clear();
    useOnboardingStore.setState({ onboarded: true, hydrated: false, exitTo: null });
  });

  async function renderDoneScreen() {
    const router = await renderRouter(tree, { initialUrl: "/onboarding/done" });
    // The gate has to have closed before the press: the bug only reproduces
    // while the guarded screens are out of the navigator.
    await waitFor(() => expect(useOnboardingStore.getState().hydrated).toBe(true));
    expect(useOnboardingStore.getState().onboarded).toBe(false);
    expect(screen.getByText("You're set")).toBeTruthy();
    return router;
  }

  it("Start chatting lands on the chat screen", async () => {
    const router = await renderDoneScreen();

    fireEvent.press(screen.getByLabelText("Start chatting"));

    expect(await screen.findByText("chat screen")).toBeTruthy();
    expect(router.getPathname()).toBe("/chat");
  });

  it("Browse all models lands on the models screen", async () => {
    const router = await renderDoneScreen();

    fireEvent.press(screen.getByLabelText("Browse all models"));

    expect(await screen.findByText("models screen")).toBeTruthy();
    expect(router.getPathname()).toBe("/models");
  });

  it("spends the destination once the screen is reached", async () => {
    await renderDoneScreen();

    fireEvent.press(screen.getByLabelText("Start chatting"));
    await screen.findByText("chat screen");

    // The intent is cleared on OBSERVED arrival, not on dispatch, so a
    // dropped navigation would keep it armed for a retry.
    await waitFor(() => expect(useOnboardingStore.getState().exitTo).toBe(null));
  });
});
