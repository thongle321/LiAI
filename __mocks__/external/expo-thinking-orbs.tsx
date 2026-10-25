/** Jest mock for `expo-thinking-orbs` (components/voice/voice-orb-hero.tsx).
 *
 *  The real package renders through React Native Skia — a native module,
 *  so like llama.rn and vision-camera this fake stands in at the module
 *  boundary rather than letting a suite load the Skia graph. It mirrors
 *  only the surfaces LiAI's voice UI consumes:
 *
 *   - `<VoiceOrb>` renders a View with the REAL component's
 *     accessibilityRole/label contract (per-state label copied from its
 *     VoiceOrb.tsx), so suites can assert which behaviour a phase resolves
 *     to through `getByLabelText`.
 *   - `useVoiceLevels` hands back plain shared-value-shaped objects — mock
 *     reanimated's `useSharedValue` returns the same shape, so consumers
 *     cannot tell the difference under Jest.
 *
 *  Per-frame animation is not exercised here: the phase → state mapping
 *  (`voiceOrbStateFor` in services/voice/voice-status.ts) is the tested
 *  logic; the paperclip rendering is device-verified (see the orb redesign
 *  spec's unverified checklist).
 */

import React, { type ReactElement } from "react";
import { View } from "react-native";

export type MockSharedNumber = { value: number };

export interface MockVoiceLevels {
  level: MockSharedNumber;
  low: MockSharedNumber;
  mid: MockSharedNumber;
  high: MockSharedNumber;
  reset: () => void;
  setSamples: (samples: ArrayLike<number>, sampleRate?: number) => void;
}

/** Copied from the real VoiceOrb.tsx (VOICE_LABELS). */
export const ORB_ACCESSIBILITY_LABELS: Record<string, string> = {
  disconnected: "Disconnected",
  connecting: "Connecting…",
  "pre-connect-buffering": "Buffering…",
  failed: "Connection failed",
  initializing: "Connecting…",
  idle: "Ready",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking…",
};

export interface MockVoiceOrbProps {
  state?: string;
  size?: number;
  paused?: boolean;
  accessibilityLabel?: string;
  inputAmplitude?: MockSharedNumber;
  outputAmplitude?: MockSharedNumber;
  inputLevels?: UnknownBands;
  outputLevels?: UnknownBands;
  color?: string;
  [key: string]: unknown;
}

/** Anything the caller feeds us is accepted and ignored. */
interface UnknownBands {
  [key: string]: unknown;
}

export function VoiceOrb(props: MockVoiceOrbProps): ReactElement {
  const { state = "idle", size = 64, accessibilityLabel } = props;
  return (
    <View
      testID="voice-orb"
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel ?? ORB_ACCESSIBILITY_LABELS[state] ?? state}
      style={{ width: size, height: size }}
    />
  );
}

export default VoiceOrb;

export function useVoiceLevels(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _options?: { sampleRate?: number },
): MockVoiceLevels {
  const zero = (): MockSharedNumber => ({ value: 0 });
  return {
    level: zero(),
    low: zero(),
    mid: zero(),
    high: zero(),
    reset: (): void => {},
    setSamples: (): void => {},
  };
}

export function useVoiceAmplitude(): {
  level: MockSharedNumber;
  set: (v: number) => void;
  setDb: (db: number) => void;
  setSamples: (samples: ArrayLike<number>) => void;
} {
  const level = { value: 0 };
  return {
    level,
    set: (v: number): void => {
      level.value = v;
    },
    setDb: (db: number): void => {
      level.value = db;
    },
    setSamples: (): void => {},
  };
}
