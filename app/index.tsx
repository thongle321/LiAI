/** First-run gate: onboarded users land in chat, the rest enter onboarding. */

import { useEffect, useState } from "react";
import { Redirect } from "expo-router";

import { isOnboarded } from "../services/onboarding.ts";

export default function IndexGate() {
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    void isOnboarded().then(setOnboarded);
  }, []);

  if (onboarded === null) return null;
  return onboarded ? (
    <Redirect href="/chat" />
  ) : (
    <Redirect href="/onboarding/welcome" />
  );
}
