/** The voice tab's hero: one Skia dot shell, the whole session's state
 *  and the tap target in one mark.
 *
 *  The orb is expo-thinking-orbs' VoiceOrb — a latitude-ring lattice whose
 *  behaviour resolves from the session phase (voiceOrbStateFor) and swells
 *  with the real audio:
 *
 *   - listening: wavefronts converge inward, depth from the live mic. The
 *     mic stream comes through useVoiceMode's onMicAudio seam into the
 *     bands capsule this component is handed (`mic`, a useVoiceLevels
 *     instance owned by the screen so it can feed it from the controller).
 *   - speaking: wavefronts expand outward. The TTS engines' streaming
 *     surface carries no metering (docs/research/2026-10-25-tts-output-
 *     levels.md), so a speech-shaped envelope is synthesised on the UI
 *     thread — same approach and constants as the package's voice example.
 *
 *  The visual IS the hit area, like the mic disc it replaces (44px target
 *  padding would make the outer ring dead to the thumb). Press feedback
 *  is the shared scale util; the haptics stay on the CONTROLLER (entry,
 *  answer), not here.
 */

import { useEffect, type ReactElement } from "react";
import { Pressable } from "react-native";
import Animated, {
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";
import {
  VoiceOrb,
  type VoiceLevels,
} from "expo-thinking-orbs";

import { useColors } from "@/themes/tokens.ts";
import { usePressFeedback } from "@/utils/motion.ts";
import {
  voiceOrbStateFor,
  type VoiceModePhase,
} from "@/services/voice/voice-status.ts";

/** The mark's points — ONE source of truth: the Pressable's inline width/
 *  height below uses this constant. 192 doubles as a 44px-scale target on
 *  every axis; resize with care. */
const ORB_SIZE = 192;

interface VoiceOrbHeroProps {
  /** The session controller's phase; drives the shell's behaviour. */
  phase: VoiceModePhase;
  /** An issue with no live session: the shell freezes as `failed`. */
  failed: boolean;
  /** The session's mic-mute flag: a muted listen renders the greyed,
   *  frozen treatment PocketPal gives a muted cloud. */
  muted?: boolean;
  /** The screen's mic capsule — fed by the controller's onMicAudio seam. */
  mic: VoiceLevels;
  /** closed → enter the gates (requestEntry); open → the cloud tap. */
  onTap: () => void;
}

/** Speech-shaped 0–1 envelope on the UI thread: syllables at a few hertz,
 *  a slower phrase contour rising over them, breath gaps every few
 *  seconds. Stands in for a real output meter (none exists in the TTS
 *  stack — see the research doc). `active=false` just stops synthesising;
 *  the level is left where it lies, because VoiceOrb ignores amplitude
 *  outside its listening/speaking behaviours and releases its own
 *  smoothing. Exported for the collapsed bar's mini orb. */
export function useSynthSpeechLevel(active: boolean): SharedValue<number> {
  const level = useSharedValue(0);
  const t = useSharedValue(0);
  const frame = useFrameCallback((info) => {
    "worklet";
    const dt = Math.min(info.timeSincePreviousFrame ?? 0, 100) / 1000;
    t.value += dt;
    const x = t.value;
    const syllable = 0.5 + 0.5 * Math.sin(x * 13);
    const phrase = 0.5 + 0.5 * Math.sin(x * 1.7 + 0.9);
    const breath = Math.sin(x * 0.55) > -0.75 ? 1 : 0;
    level.value = Math.min(1, syllable * (0.35 + 0.65 * phrase) * breath);
  }, false);
  useEffect(() => {
    frame.setActive(active);
  }, [active, frame]);
  return level;
}

export function VoiceOrbHero({
  phase,
  failed,
  muted = false,
  mic,
  onTap,
}: VoiceOrbHeroProps): ReactElement {
  const colors = useColors();
  const press = usePressFeedback();
  const open = phase !== "closed";
  const orbState = voiceOrbStateFor(phase, failed);
  const speech = useSynthSpeechLevel(phase === "speaking");
  // The muted treatment is the LISTENING look, exactly like the
  // reference's voiceVisual: a speaking shell keeps its colour mid-turn;
  // muting while speech is live still ends its audio via the controller.
  const mutedListen = muted && phase === "listening";

  return (
    <Animated.View style={press.animatedStyle}>
      <Pressable
        onPress={onTap}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        className="items-center justify-center"
        style={{ width: ORB_SIZE, height: ORB_SIZE }}
        accessibilityRole="button"
        accessibilityLabel={open ? "Tap to stop or take the turn" : "Tap to speak"}
      >
        <VoiceOrb
          state={orbState}
          size={ORB_SIZE}
          color={mutedListen ? colors.secondaryText : colors.primary}
          paused={mutedListen}
          inputAmplitude={mic.level}
          inputLevels={mic}
          outputAmplitude={speech}
        />
      </Pressable>
    </Animated.View>
  );
}
