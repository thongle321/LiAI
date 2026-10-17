/** First-run gate: onboarded users land in chat, the rest enter onboarding. */

import { useEffect, useState } from "react";
import * as SplashScreen from "expo-splash-screen";
import { Redirect } from "expo-router";

import { isOnboarded } from "../services/onboarding.ts";

export default function IndexGate() {
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    void isOnboarded().then((value) => {
      setOnboarded(value);
      // Keep the native splash up until the first-run gate has resolved so
      // cold start doesn't flash a blank base-colour frame (D4-19).
      void SplashScreen.hideAsync().catch(() => {});
    });
  }, []);

  if (onboarded === null) return null;
  return onboarded ? (
    <Redirect href="/chat" />
  ) : (
    <Redirect href="/onboarding/welcome" />
  );
}
