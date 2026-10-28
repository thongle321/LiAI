# PocketPal hands-free voice in chat (#1007) — parity research

Date: 2026-10-27. Reference: pocketpal commit `bf59697d` — 140 files, +10043/-347.
The engine half of modern hands-free voice (Whisper STT + cascade) arrived in
LiAI via commit `4a76784b` (#1017), spec
`docs/specs/2026-10-25-voice-unified-whisper.md`. This doc covers #1007's
**in-chat UX layer** — the half #1017's spec deliberately listed as non-goals.

## What PocketPal hands-free is

A continuous voice conversation loop that **lives in the chat screen**, not in
a separate surface: mic PCM streams through a VAD endpointer, utterances go
through the normal chat send path, and replies are streamed aloud via TTS.
State machine: `closed → starting → listening → transcribing → thinking →
speaking → listening …`.

Core files (pocketpal-ai/, read-only reference):

| File | Role |
|---|---|
| `src/store/VoiceModeStore.ts` | MobX store: `VoicePhase` union, `micMuted`, `presentation: 'full' \| 'bar'`, `lastError`, persisted Settings override |
| `src/hooks/useVoiceMode.ts` | `VoiceModeController` class (681 lines): entry gates, mic capture, endpointing, phase machine, interruptions, exits |
| `src/services/voice/cascadeEngine.ts` | `VoiceEngine`: Whisper → chat send (`VoiceTurnPort`) → TTS; `interrupt()` |
| `src/services/voice/endpointer.ts` | Energy VAD utterance segmentation |
| `src/services/voice/constants.ts` | Timers (see thresholds below) |
| `src/services/voice/deviceGate.ts` | Tier gate (`high`/`flagship`, iOS also `mid`) |
| `src/services/voice/readiness.ts` | Requires a **neural** TTS voice; system voice excluded |
| `src/components/VoiceModeView/` | Full-screen view: status title/hint, mute + End, pull-down-to-collapse |
| `src/components/VoiceCloud/` | Animated blob visualizer, `voiceVisual(phase, micMuted)` |
| `src/components/VoiceBar/VoiceBar.tsx` | Collapsed bar in the composer's place while the session runs |
| `src/components/VoiceModeButton/VoiceModeButton.tsx` | Composer button replacing Send when the input is empty |
| `src/components/VoiceSetupSheet/`, `VoiceMemorySheet/`, `VoiceTeaser/` | Entry sheets (teaser = Plus paywall — irrelevant to LiAI) |
| `src/utils/asrMicPermission.ts`, `keepAwake.ts`, `voiceTrace.ts` | Support utils |
| Native: `@fugood/react-native-audio-pcm-stream`, `whisper.rn`, `@pocketpalai/react-native-speech` (`onAudioInterruption`) | Capture / STT / TTS + audio-interruption events |

## Thresholds (reference values, most already ported by #1017)

```
VOICE_ENDPOINT_HANG_MS    = 600    // silence that ends an utterance
VOICE_CAPTURE_SETTLE_MS   = 150    // between mic stop and next start (Android)
VOICE_MIC_WATCHDOG_MS     = 3000   // no audio → restart once, then exit
VOICE_START_TIMEOUT_MS    = 45_000 // Whisper+voice load budget
VOICE_FIRST_CHUNK_HOLD_MS = 1500   // hold speech while a model decodes
ASR: 16 kHz mono 16-bit, 50 ms chunks, RMS floor 0.01,
     min speech 300 ms, max segment 25 s
```

All of the above exist in LiAI (`services/voice/constants.ts`,
`services/asr/constants.ts`), except the first-chunk hold figure (LiAI holds
1.2 s — recorded divergence, unchanged).

## UX flow (PocketPal)

### Entry
- **Composer button**: when the text input is empty, a waveform
  `VoiceModeButton` (primary background; Plus badge when locked) replaces Send
  (only when `supported`, no text/images, not editing, no capture running).
- Tap → dismiss keyboard → `requestEntry({openModelPicker, focusInput})`.
- **Gates, in order**: Plus teaser → no model loaded (open model picker) →
  setup incomplete (whisper tier + neural voice + mic → `VoiceSetupSheet`) →
  memory fit (`fits/tight/wont_fit` → `VoiceMemorySheet`).
- `enter()`: `voiceOutputActive(true)` with first-chunk hold, keep-awake,
  phase `starting`, 45 s `engine.prepare` timeout → `listening` + capture.

### Full view
- Covers the chat: drag handle + "Pull down to see the chat", the animated
  cloud (~280 px, 4 blurred blobs), status title + hint, mic-mute toggle
  (mic-off on error-container background) + red End button.
- Visual motion by phase: listening = breathing scale; thinking =
  continuous 360° turn; speaking = mouth-like pulses; muted = grey, frozen.
- Status copy: "Listening" / "Pause when you're done, or tap the cloud to
  send"; "Thinking" / "Tap the cloud to cancel"; "Speaking" / "Tap the cloud to
  interrupt"; "Starting"; "Microphone off". Error hints override: 
  `transcribe_failed` → "Couldn't catch that. Try again.", plus
  `reply_failed` and `speech_failed` lines. Statuses are announced to screen
  readers.
- **Collapse**: pull down ≥80 pt (or flick ≥800 pt/s), Android back, or tap
  the handle → `presentation = 'bar'`; the session keeps running.
- **Bar**: rounded bar in the composer's place — 56 px mini cloud, status
  title, mute + End; tap or swipe up (≥40 pt) re-expands. Chat stays visible
  and scrollable the whole time.

### Turn
- End of utterance: 600 ms silence after ≥300 ms voiced, 25 s cap, or tap the
  cloud (forced endpoint). Mic stops, phase `transcribing`.
- Transcript via whisper → `thinking`; send through the normal chat path
  (`port.send`, turns carry `spoken: true` metadata); speech starts when TTS
  synthesis emits its first chunk → `speaking`; turn ends when playback idles.
- **Auto-relisten**: after every turn outcome the loop restarts capture with
  no user action.

### Interrupt / interruptions
- Tap cloud during transcribing/thinking/speaking → interrupt: cancel
  transcription if still decoding, else stop TTS + chat Stop; partial reply
  kept.
- **Audio interruption** (phone call/alarm, `onAudioInterruption`): `began`
  stops mic + interrupts the turn + flags paused + mic shown off; `ended`
  resumes unmuted (also resumed by cloud tap or app active). Watchdog
  suspended during the pause.
- App backgrounding → exit. Chat/model switch → exit (own sends exempt).

### Exits
End button, blur, background, dispose, start failure, fatal mic failure
(watchdog: one restart after 3 s silent, then exit). Closing resets
`micMuted` and presentation to `'full'`.

## What LiAI already has (from #1017)

Same phase machine, endpointer, cascade engine, mic watchdog, keep-awake,
memory-fit sheet, tap-to-interrupt, auto-relisten, streaming TTS turns, entry
gates (model-ready → setup sheet → memory sheet). Deliberately divergent:
no Plus/teaser, no device gate, no voice-picker setup step, voice phase in
local React state inside `hooks/useVoiceMode.ts` (single mount, Voice tab
only).

## Diff: what this port adds

| PocketPal | LiAI today | Port? |
|---|---|---|
| Hands-free entry from the chat composer (button replaces empty-input Send) | Chat mic button is dictation-only; hands-free only via Voice tab | Yes |
| Full-screen `VoiceModeView` overlay over chat | Dedicated tab only | Yes |
| Collapse-to-`VoiceBar`, session keeps running, chat scrollable | Nothing equivalent | Yes |
| Mic mute mid-session (greyed, frozen visualizer) | Absent | Yes |
| Audio-interruption pause/resume (phone call, alarm) | Absent | Yes |
| Per-turn `speech_failed` + error hint copy | Recorded #1017 non-goal | Yes |
| `spoken: true` chat-turn metadata | `voiceMode: true` equivalent exists | No |
| Visualizer blob | LiAI orb (`expo-thinking-orbs` + `voiceOrbStateFor`) | No — keep orb |
| Plus gate, device gate, Settings toggle, neural-voice-required setup | N/A / deliberate divergence | No |
| Network (wavstream) internals, vtrace | Not applicable | No |

## Verdict

Port the UX layer onto the existing engine. The only structural change: phase
(`micMuted`, `presentation`, `lastIssue`) moves from controller-local state
into a small Zustand voice-mode store so the chat screen and the Voice tab
observe one session; the controller logic itself is untouched and stays
mounted exactly once. Spec: `.scratch/hands-free-in-chat/spec.md`.
