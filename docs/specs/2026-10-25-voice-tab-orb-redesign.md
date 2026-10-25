# Voice tab: redesign around the expo-thinking-orbs shell

Scope decisions (user, this session): full visual redesign of `app/(drawer)/(tabs)/voice.tsx`
around `expo-thinking-orbs`' `<VoiceOrb>`; brand-blue tint; sherpa-onnx removed;
research real TTS output levels first with a synthetic fallback (found: absent;
see `docs/research/2026-10-25-tts-output-levels.md`). Approved new deps:
`expo-thinking-orbs` (JS-only, MIT) + `@shopify/react-native-skia` (native — a
dev-client rebuild is REQUIRED after this lands; Expo Go is not a supported
path for the orb).

## State mapping (`services/voice/voice-status.ts`)

`voiceOrbStateFor(phase, failed)` is the single source of truth, tested in
`services/voice/__tests__/voice-status.test.ts`:

| `VoiceModePhase` | failed | `VoiceOrbState` |
| --- | --- | --- |
| closed | no | `idle` (breathing rest) |
| closed | yes (issue) | `failed` (frozen shell) |
| starting | — | `initializing` (dots assemble) |
| listening | — | `listening` (wavefronts converge with the mic) |
| transcribing | — | `thinking` |
| thinking | — | `thinking` |
| speaking | — | `speaking` (wavefronts expand with the voice) |

**`failed` is reserved for a CLOSED session under an issue** (dead gate: mic
blocked, stale dev build, failed start, "no audio from the microphone" —
which ends the session, so it IS closed). A mid-session problem keeps its
live behaviour: the transcribe-failure path returns to `listening` WITH the
issue set, and freezing the orb there would contradict the still-running
turn; the issue text under the orb carries the problem. Verified in tests
(`listening`/`speaking` with `failed=true` stay live).

## Audio wiring

- **Input (real):** the controller's capture chunks flow unchanged to the
  Endpointer; `hooks/useVoiceMode.ts` gains an `onMicAudio?: (pcm:
  Float32Array) => void` seam (`pushChunk` decodes each 50 ms int16 chunk
  with `int16PcmToFloat32` and hands it over, error-isolated with try/catch —
  a level consumer must never take the session down). The screen creates ONE
  `useVoiceLevels({ sampleRate: ASR_SAMPLE_RATE })` capsule and passes
  `onMicAudio: mic.setSamples`, so the orb gets amplitude + low/mid/high
  bands (swell / ripple / ink) from live speech.
- **Output (synthesised envelope):** no TTS metering exists (research doc);
  `useSynthSpeechLevel` runs a `useFrameCallback` worklet while `phase ===
  "speaking"` only, writing a 0–1 speech-shaped envelope into the
  `outputAmplitude` SharedValue. UI thread, no re-renders, no interval.

## Component + screen (`components/voice/voice-orb-hero.tsx`)

- ORB_SIZE 192 (`h-48 w-48` on the Pressable) — the visual IS the hit area,
  the exact rule the old mic disc enforced. Press feedback = the shared
  scale util. Press label contract kept: `Tap to speak` (closed) /
  `Tap to stop or take the turn` (open). Haptics stay on the CONTROLLER.
- `color={colors.primary}` — brand blue tint; the depth ramp rebuilds around
  it, so light/dark both read.
- The screen recomposes around the orb (label, heard caption, End, reply
  text, issue block, sheets all keep their behavior/labels): the
  "Playing audio…" overlay becomes an absolute-positioned stop-bar at
  bottom during playback (the orb IS the talking indicator now; no
  ActivityIndicator spinner), and the mic's phase-driven pulse is gone —
  the shell's own behaviours carry the motion.
- `app.json`: `ios.infoPlist.CADisableMinimumFrameDuration = true` (the
  package's 120 Hz opt-in; OptIn doubles per-frame budget on ProMotion).

## Dependencies

- ADDED: `expo-thinking-orbs@0.2.1`, `@shopify/react-native-skia@2.6.2`
  (bun, SDK-57-matched via `expo install`).
- REMOVED: `react-native-sherpa-onnx` (stale — no runtime import; package,
  jest mock + config entry, AGENTS.md mentions). One dev-client rebuild
  covers both the Skia add and the sherpa removal.

## Tests

- `services/voice/__tests__/voice-status.test.ts`: `voiceOrbStateFor` matrix
  (above).
- `hooks/__tests__/useVoiceMode.test.tsx`: `onMicAudio` seam — decoded
  floats, endpointer path untouched, no leakage past a turn's capture.
- `components/voice/__tests__/voice-orb-hero.test.tsx`: phase→behaviour via
  the orb's label contract, press split, failed-freeze with live tap.
- `jest/voice-screen.test.tsx`: unchanged contract suite + new wiring
  assertion (`onMicAudio` reaches the controller hook).
- `jest/module-boundary-mocks.test.tsx`: the `__mocks__/external/
  expo-thinking-orbs.tsx` fake imports/renders (per-state label View,
  `useVoiceLevels`/`useVoiceAmplitude` inert levels).

## Device-unverified checklist

Everything Skia is out of `bun run test`'s reach:
- The orb actually renders and animates at 60/120 fps on device (dev build
  required — `npx expo run:android` / `run:ios`).
- Audio-reactive listening (bands follow real speech; `useVoiceLevels`'
  PROVISIONAL band gains per the package docs).
- Synthesised speech envelope visually tracks a real TTS reply.
- The failed/idle/initializing blends read correctly at the 192 size.
