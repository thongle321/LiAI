/** Startup gate: hydrate the stores, then route.
 *
 * Everything the app needs to render a truthful first frame is read HERE, once,
 * before any screen mounts. Four stores gate on it:
 *
 *  - The model store, because a chat screen that renders before the catalog is
 *    read shows "no model" and disables Send, and `checkHealth()` reports the
 *    provider "down" — all of it false, and all of it fixed by opening the
 *    Models screen once. Hydrating before the redirect means the chat route
 *    never paints against an empty store (D3-1).
 *  - The inference store, for the same reason one frame later.
 *  - The search store, because `defaultSearchAuth` gates on persisted
 *    `hasConsented`; unhydrated it reads `false` and the web_search talent
 *    reports the provider disabled (D3-5).
 *  - The voice store, because `deviceMeetsMemory` is computed during
 *    hydration: unhydrated it reads `false`, so the voice chip is hidden,
 *    `canSpeak` is false and auto-speak never fires (D3-4).
 *  - The first-run gate, so a deep link cannot skip onboarding.
 *
 * The native splash stays up until this resolves, so the wait is a held frame
 * rather than a flash of placeholder content (D4-19).
 */

import { useEffect, useState } from "react";
import * as SplashScreen from "expo-splash-screen";
import { Redirect } from "expo-router";

import {
  createAutoRelease,
  restoreAutoReleasedModel,
} from "@/services/inference/auto-release.ts";
import { useInference } from "@/store/inference";
import { useModelStore } from "@/store/model-store";
import { useOnboardingStore } from "@/store/onboarding";
import { useSearch } from "@/store/search";
import { useVoice } from "@/store/voice";

export default function IndexGate() {
  // The first-run gate is SUBSCRIBED, not snapshotted: the root layout
  // guards the drawer with the same value, and two readers of one flag
  // can disagree about whether the app is provisioned. `ready` is this
  // screen's own wait (the other stores); `hydrated` is the store's.
  const [ready, setReady] = useState(false);
  const onboarded = useOnboardingStore((s) => s.onboarded);
  const hydrated = useOnboardingStore((s) => s.hydrated);
  const loadPersisted = useModelStore((s) => s.loadPersisted);
  const loadInference = useInference((s) => s.load);
  const loadSearch = useSearch((s) => s.load);
  const loadVoice = useVoice((s) => s.load);
  const hydrateOnboarding = useOnboardingStore((s) => s.hydrate);

  useEffect(() => {
    void (async () => {
      // All three are single-flight internally, so awaiting them together is
      // safe regardless of order and none blocks another.
      //
      // Search is here because `defaultSearchAuth` reads `hasConsented` off
      // the store, and consent is persisted. Without this, every cold start
      // answered the web_search talent with "provider not enabled" until
      // Settings had been opened once in that session (D3-5).
      //
      // Voice is here because `deviceMeetsMemory` is computed DURING
      // hydration. Unhydrated it reads `false`, so the voice chip is hidden,
      // `canSpeak` is false and auto-speak never fires (D3-4).
      await Promise.all([loadPersisted(), loadInference(), loadSearch(), loadVoice()]);
      // The model this app auto-released when it was last backgrounded is
      // warmed up HERE, while the splash still covers the wait: the first
      // message then finds a warm engine instead of paying for a
      // multi-gigabyte read (PocketParity: checkAndReloadAutoReleasedModel,
      // ModelStore.ts:1148). Bounded, and it never rejects — but the splash
      // is the app's first frame, so nothing may keep it up: a failure
      // opens the app without the model.
      await restoreAutoReleasedModel(createAutoRelease()).catch(() => {});
      // The first-run gate is the STORE's, not a private read: the root
      // layout guards the drawer with the same value, and two readers of
      // one flag can disagree about whether the app is provisioned.
      await hydrateOnboarding();
      setReady(true);
      void SplashScreen.hideAsync().catch(() => {});
    })();
  }, [loadPersisted, loadInference, loadSearch, loadVoice, hydrateOnboarding]);

  if (!ready || !hydrated) return null;
  return onboarded ? (
    <Redirect href="/chat" />
  ) : (
    <Redirect href="/onboarding/welcome" />
  );
}