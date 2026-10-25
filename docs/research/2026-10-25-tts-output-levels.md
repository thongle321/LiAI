# Real TTS output levels for the voice orb?

**Question (2026-10-25, voice-tab orb redesign):** can the voice orb's
`outputAmplitude` be a REAL meter of what the TTS playback is producing?

## What was checked

The orb package (`expo-thinking-orbs`) renders only; it consumes a 0–1
`SharedValue`. Real output levels require a source at playback time. LiAI's
TTS stack:

| layer | module | metering surface |
| --- | --- | --- |
| Neural engines (kitten/kokoro/supertonic/phonon) | `@pocketpalai/react-native-speech` | `createSpeechStream(voiceId, opts)` accepts TEXT (`appendText`), `onProgress` (chunk progress) — no PCM frames, no amplitude, no dB callback (see `services/tts/streamingHandle.ts`) |
| Engine registry | `services/tts/engines/*` | `play(text, voice)` / `isInstalled()`; progress events only. Nothing returns samples or audio-graph hooks |
| System engine | `expo-speech` | OS synthesizer speak/stop — `expo-speech` exposes no metering at all |
| Playback state | `store/voice.ts` | `PlaybackState` (idle/playing/streaming) — a mode, not a level |

`react-native-sherpa-onnx` is NOT in the runtime TTS path (it was already
out of all runtime imports before this cleanup; it remained only as a stale
dependency + jest mock + AGENTS.md mention).

## Verdict

**No real output metering exists in this stack.** Playback hands audio to
the native side (or OS synthesizer) and nothing echoes a level back.

## Decision (user, this session)

Option 2: research real levels first, synthetic fallback otherwise →
confirmed absent, so `outputAmplitude` is fed a **synthesised speech
envelope** while `phase === "speaking"` (`useSynthSpeechLevel` in
`components/voice/voice-orb-hero.tsx`): syllables at a few hertz, a slower
phrase contour over the top, breath gaps — same approach and constants as
the package's own example voice screen. It writes a SharedValue on the UI
thread; no React re-renders, no JS interval.

*If an engine later gains a meter callback, `useSynthSpeechLevel`'s call
site is the only thing to swap — its consumers (`outputAmplitude`) and the
orb wiring stay unchanged.*
