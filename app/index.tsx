/** Startup gate: hydrate the stores, then route.
 *
 * Everything the app needs to render a truthful first frame is read HERE, once,
 * before any screen mounts. Three stores gate on it:
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
 *  - The first-run gate, so a deep link cannot skip onboarding.
 *
 * The native splash stays up until this resolves, so the wait is a held frame
 * rather than a flash of placeholder content (D4-19).
 */

import { useEffect, useState } from "react";
import * as SplashScreen from "expo-splash-screen";
import { Redirect } from "expo-router";

import { isOnboarded } from "../services/onboarding.ts";
import { useInference } from "../store/inference";
import { useModelStore } from "../store/modelStore";
import { useSearch } from "../store/search";

export default function IndexGate() {
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  const loadPersisted = useModelStore((s) => s.loadPersisted);
  const loadInference = useInference((s) => s.load);
  const loadSearch = useSearch((s) => s.load);

  useEffect(() => {
    void (async () => {
      // All three are single-flight internally, so awaiting them together is
      // safe regardless of order and none blocks another.
      //
      // Search is here because `defaultSearchAuth` reads `hasConsented` off
      // the store, and consent is persisted. Without this, every cold start
      // answered the web_search talent with "provider not enabled" until
      // Settings had been opened once in that session (D3-5).
      await Promise.all([loadPersisted(), loadInference(), loadSearch()]);
      setOnboarded(await isOnboarded());
      void SplashScreen.hideAsync().catch(() => {});
    })();
  }, [loadPersisted, loadInference, loadSearch]);

  if (onboarded === null) return null;
  return onboarded ? (
    <Redirect href="/chat" />
  ) : (
    <Redirect href="/onboarding/welcome" />
  );
}