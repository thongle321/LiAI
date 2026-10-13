# Voice feature (TTS) — PocketPal parity on sherpa-onnx

Date: 2026-10-13. Status: **agreed, not implemented**. Produced by a
grilling session over `pocketpal-ai/`'s voice architecture; this is the
decision record. Implementation follows this doc; deviations update it.

## Why

PocketPal ships an offline TTS stack (4 engines, voice picker, per-message
replay, streaming auto-speak). LiAI wants feature parity but on its own
stack: **expo-speech** for the system engine and
**react-native-sherpa-onnx** for the neural engine, instead of PocketPal's
`@pocketpalai/react-native-speech` fork, MobX, and ad-hoc RNFS downloads.

Research verdict on the reference app: **PocketPal has TTS only — no
STT/voice-input anywhere.** Its shape:

- `pocketpal-ai/src/services/tts/` — `Engine` interface, static registry
  (kitten/kokoro/supertonic/system), singleton `TTSRuntime` (single-slot
  native model, FIFO mutex), `streamingHandle` (300-char batching),
  `thinkingStripper` (strips only `\u003cthink\u003e…\u003c/think\u003e` markup)
- `store/TTSStore.ts` — MobX, persisted prefs + runtime playback state
  machine, per-engine download states, RAM gate.
- Three UI surfaces: global `TTSSetupSheet` (75% detent), composer
  `VoiceChip`, per-message `PlayButton` (`components/TextMessage/`).
- Chat hook captures auto-speak at send, feeds start/chunk/complete from
  token events.

## Decisions

| # | Decision | Choice |
| --- | --- | --- |
| Q1 | Scope | **TTS output only.** No STT (`expo-speech-recognition` stays untouched) |
| Q2 | Engines v1 | **System (expo-speech) + Kokoro (sherpa)** behind a PocketPal-shaped `Engine` interface. Kitten/Supertonic = phase 2 |
| Q3 | Playback timing | **Speak-on-completion.** Feed the finished text at `run_finished`; store API shaped so streaming drops in later |
| Q4 | Model download | **sherpa's built-in download manager** (`react-native-sherpa-onnx/download`): GitHub registry, SHA-256, resume, progress, disk checks. Same code for Android + iOS |
| Q5 | Audio playback | **sherpa's native PCM player** (`startPcmPlayer`/`writePcmChunk`/`stopPcmPlayer`). System engine plays inside expo-speech. **No `expo-audio`, no player dep** |
| Q6 | Dependencies (AGENTS.md approval) | `react-native-sherpa-onnx` + peers `@dr.pogodin/react-native-fs`, `@kesha-antonov/react-native-background-downloader` — **approved as one unit** |
| Q7 | Platforms | **Code targets Android + iOS; builds Android-only for now.** No `ios/` dir exists; the background-downloader AppDelegate hook is deferred to first iOS prebuild (README's Expo config plugin is **unverified**) |
| Q8 | Kokoro model | **English-only** (`kokoro-en-v0_19`/`v1_0` family; exact registry ID verified at install time) |
| Q9 | Voice selection | **System voices: no selection** (never enumerate expo-speech voices). **Kokoro: PocketPal-style voice picker** |
| Q10 | Strip before speaking | Remove `\u003cthink\u003e`/reasoning tags, fenced code, inline code, links, images, tables before `generateSpeech`. **No** "Hmm, let me think" placeholder (streaming-only affordance) |
| Q11 | Default engine | **System is the no-download default.** Nothing downloaded → system speaks. Kokoro downloads → selectable |
| Q12 | Kokoro voices | **Curated ~20 named voices**, sid-mapped, PocketPal-style radio list |
| Q13 | UI surfaces | **All three:** global setup sheet, composer `VoiceChip`, per-message `PlayButton` — same code and UI as PocketPal |
| Q14 | Architecture | **PocketPal's architecture and techniques on LiAI's stack:** MobX `TTSStore` → **Zustand** + AsyncStorage; single-slot engine runtime (FIFO mutex); `autoSpeakEnabled` default off; 4 GB RAM gate + trististate user override; stop on background/session-switch/abort; voice reconciled against the file system on init |
| Q15 | System in the picker | **(a)** A **"System" group with one row — "Device default voice"** (selectable, switchable back to after picking kokoro). Not PocketPal's dead-end where system vanishes |
| Q16 | Voice preview | **Copied from PocketPal** — same code and UI; speaks a canned sample through the engine, enabled only when downloaded |
| Q17 | Strings | **English hardcoded** in one strings spot (LiAI has no i18n layer; future `t()` swap stays cheap) |

### Deliberately deferred (phase 2, not dropped)

- Streaming playback (`createStreamingTTS` + thinking-placeholder cue)
- Kokoro speakers beyond the curated 20
- Kitten / Supertonic engines
- STT (its own design: `expo-speech-recognition` vs sherpa's STT + native
  mic capture — that choice was never grilled and must not be assumed)

## Architecture

Port PocketPal's layering, swap the seams:

```
pocketpal-ai                          LiAI
──────────────────────────────        ──────────────────────────────
Engine interface + registry           same shape; 2 engines
  fork Speech module                  SystemEngine → expo-speech
                                      KokoroEngine → sherpa createTTS
TTSRuntime (single-slot mutex)        same technique — one native model
                                      slot, acquire/release FIFO
streamingHandle (phase 2)             deferred; v1 uses play-after-complete
thinkingStripper                      ported + extended (Q10 strips code,
                                      links, tables; no placeholder cue)
RNFS ad-hoc per-engine downloads      sherpa download manager, mapped into
                                      PocketPal's DownloadState machine
                                      (not_installed/downloading/ready/error)
MobX TTSStore                         Zustand store + AsyncStorage subset
TTSSetupSheet (paper)                 house components/Sheet.tsx (TrueSheet)
VoiceChip / PlayButton                ported as-is
```

### Store shape (Zustand, mirroring `TTSStore.ts`)

- Persisted: `autoSpeakEnabled` (default `false`), `currentVoice`
  (`{id, engine, name?} | null`), `userTTSOverride` (trististate).
- Runtime: `playbackState` (`idle | streaming | playing` + messageId),
  per-engine `DownloadState`/`Progress`/`Error` triplet, `deviceMeetsMemory`,
  `isSetupSheetOpen`, `lastSpokenMessageId`.
- Derived: `isTTSAvailable` = override ?? (`totalMemory >= 4 GB`).
- `init()`: reconcile download states from `isModelDownloadedByCategory`,
  clear-then-stash a persisted voice whose model vanished, AppState
  listener (background → stop + release engine).

### Speak path (v1)

```
run_finished → play(messageId, finalText, {hadReasoning})
  → strip (Q10 cleaner)
  → engine = currentVoice?.engine ?? 'system'
  → neural: runtime.acquire → createTTS(localPath) → generateSpeech
      → startPcmPlayer(sr, 1) → writePcmChunk(samples) → stopPcmPlayer
  → system: expo-speech speak()
```

Auto-speak additionally gated on `isTTSAvailable`, `autoSpeakEnabled`,
`currentVoice != null` (system default satisfies this), messageId ≠
last-spoken. Abort/background/session-switch → `stop()`.

### Download path

`refreshModelsByCategory(Tts)` for the picker's model list →
`downloadModelByCategory(id, {onProgress, signal})` →
`getLocalModelPathByCategory` → `{type:'file', path}` into `createTTS`.
Progress maps into PocketPal's `NeuralDownloadState` machine; disk-space
preflight is the manager's (PocketPal's own ×1.2 preflight is redundant).

## Files (planned)

| Change | Where |
| --- | --- |
| Engine types, registry, runtime | `lib/tts/{types,engineRegistry,runtime}.ts` |
| SystemEngine (expo-speech), KokoroEngine (sherpa) | `lib/tts/engines/{system,kokoro}/` |
| Strip cleaner (ported `ThinkingStripper` + Q10 rules) | `lib/tts/strip.ts` |
| Download bridge to sherpa manager | `lib/tts/download.ts` |
| Store | `store/tts.ts` |
| Setup sheet (house Sheet) + voice list + preview + AutoSpeakRow | `components/voice/…` |
| Composer chip | alongside existing chat input controls |
| Per-message play button | message rendering component |
| Chat hook wiring (send-capture, complete, abort) | existing chat hook |
| Strings | `constants/voice-strings.ts` (Q17) |
| Tests | `tests/` — strip rules, store state machine, download-state mapping |

## Open items (facts to verify during implementation)

1. **Registry kokoro model ID + size** — run
   `refreshModelsByCategory(ModelCategory.Tts)` at install; confirm an
   English kokoro entry exists.
2. **sid ↔ voice-name order** — validate the curated 20-name list against
   `getNumSpeakers()` on the downloaded model.
3. **PCM player on the batch engine** — docs show it on
   `createStreamingTTS`; if `createTTS` lacks it, playback uses the
   streaming engine with a full-buffer write. Design unchanged.
4. **iOS config plugin** for the background downloader — verify when iOS
   builds start (Q7).
5. **LGPL notice** — sherpa ships FFmpeg + Shine MP3 encoder; clear
   before store submission.

## Risks

- `react-native-sherpa-onnx` is a 0.x, single-maintainer package (0.4.4,
  2026-09-08, actively maintained).
- Gradle fetches native libs at build time — network needed against the
  committed `android/`.
- npm auto-installs two extra native peer deps (Q6 approved).
- Research was docs/code-only; no sherpa API has been exercised on a
  device yet — open item 3 is the likeliest surprise.
