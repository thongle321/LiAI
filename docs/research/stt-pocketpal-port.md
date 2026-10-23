# Research: porting pocketpal-ai's STT to aivision (expo stack)

## Goal
Replicate pocketpal-ai's on-device Whisper STT (`useVoiceCapture`) in aivision,
but replace `@fugood/react-native-audio-pcm-stream` with an Expo-compatible PCM
streaming library. Full feature parity with pocketpal's dictation (composer append,
VAD, segmenter, memory gating, cancel, background cleanup).

## pocketpal-ai implementation (reference)
- Audio capture: `@fugood/react-native-audio-pcm-stream` → raw PCM 16 kHz / mono / 16-bit,
  `AudioRecord.on('data', chunk)` base64 chunks.
- ASR engine: `whisper.rn` (`whisperAsrEngine.transcribe`).
- Subsystem `src/services/asr/`: constants, energyVad, speechSegmenter, types, index.
- Hook `src/hooks/useVoiceCapture.ts`: tap-to-start/stop, permission, memory gating,
  VAD skip, segmenter → transcribe queue, chatBusyOnCpu coordination, max duration
  cap, no-audio timeout, background/unmount cleanup, cancel with session tokens.
- Store `asrStore` (mobx): captureState, inputLevel, spokenLanguage, selectedTier,
  asrAvailable, isSelectedTierReady, hasMemoryForCapture, setError/resetCapture.
- UI: `VoiceRecordingBar`, `VoiceChip` in ChatInput; transcript appended to composer.

## Expo-compatible PCM streaming candidates
1. `expo-audio-stream` (mykin-ai) — **recommended**. Expo module, `startRecording`
   with `onAudioStream` callback delivering base64 PCM chunks at a configurable
   `interval` (ms), sampleRate/channels/encoding (`pcm_16bit`). Provides
   `soundLevel` for metering. Works in Expo dev client. Closest API to
   `@fugood/react-native-audio-pcm-stream`.
2. `@siteed/audio-studio` — comprehensive but heavier; overkill.
3. `react-native-nitro-realtime-audio` — Nitro-based, not Expo-native module;
   requires custom native build wiring.

## Additional dependency needed
- `whisper.rn` (0.7.x) — aivision currently only has `llama.rn`. Required for
  on-device Whisper transcription. Must be added to package.json + native build.

## Porting plan (phases)
1. Deps: add `expo-audio-stream` and `whisper.rn`; rebuild dev client.
2. Port `services/asr/*` (constants, energyVad, speechSegmenter, types) verbatim
   (pure TS, no native imports).
3. Create `services/asr/whisper-asr-engine.ts` wrapping whisper.rn (init model,
   transcribe, cancel, release) — adapt pocketpal's engine.
4. Create `store/asr.ts` (Zustand) mirroring asrStore fields + methods.
5. Port `hooks/useVoiceCapture.ts`, swapping AudioRecord with expo-audio-stream:
   - `ExpoPlayAudioStream.startRecording({ sampleRate:16000, channels:1,
     encoding:'pcm_16bit', interval: 100? , onAudioStream })`
   - chunk → `toByteArray(event.data)` → segmenter.push
   - stopRecording() on finish/cancel
   - soundLevel → pushInputLevel
6. Permission: keep aivision's `ensureMicAccess` (expo-speech-recognition) OR
   use expo-audio-stream's permission helpers. Recommend keeping expo-speech-
   recognition for permission UX consistency, since expo-audio-stream also
   needs mic permission.
7. UI: add `VoiceRecordingBar` + mic button in chat input (composer append,
   never auto-send) — mirror pocketpal's ChatInput voice section.
8. Tests: port `useVoiceCapture.test.ts` with expo-audio-stream mocked.

## Risks / open questions
- whisper.rn native module availability in Expo dev client (needs config plugin
  or manual native wiring). Verify before committing.
- expo-audio-stream chunk interval (default 250ms) vs pocketpal's ASR_CHUNK_BYTES
  (smaller). Tune segmenter thresholds accordingly.
- Memory gating: aivision has no device-tier ASR memory model; reuse pocketpal's
  `hasMemoryForCapture` heuristic or simplify.
- aivision's existing voice loop (expo-speech-recognition) auto-sends; new STT
  path appends to composer. Both can coexist (mic button in composer = Whisper
  dictation; voice tab = OS STT loop).

## Recommendation
Proceed in phases. Start with Phase 1-2 (deps + pure asr port) as a PR, then
Phase 3-5, then UI. Do not attempt all in one pass — native build verification
is required between phases.

## ASR settings UI (current)

PocketPal's ASR surface is not a picker: flat rows inside the App Settings
card, one per tier, with the label at `bodyMedium` (14/20) and the size at
`labelSmall` (11/16), and a single action on the right — Download (Retry on
error), disabled Downloading…, or Remove. Nothing marks which tier is active
except the store's `selectedTier`, and `ASRStore.downloadModel` selects the
tier it just installed.

LiAI follows the same flat rows and install-selects behaviour inside the
Voice Input card. It keeps the existing free-space caption, marks the active
installed tier with a Check (PocketPal shows no visible selection), and adds
tap-to-switch so changing tiers does not require a delete/reinstall. The rows
hide while Voice input is off, as they do in PocketPal.
