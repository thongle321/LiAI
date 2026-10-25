import { PHONON_VOICE_PINS } from "@/services/tts/constants.ts";
import type { Voice } from "@/services/tts/types.ts";

export const PHONON_VOICES: Voice[] = PHONON_VOICE_PINS.map((pin) => ({
  id: pin.name,
  name: pin.name,
  engine: "phonon" as const,
  language: pin.locale,
  gender: pin.gender === "female" ? "f" : "m",
}));