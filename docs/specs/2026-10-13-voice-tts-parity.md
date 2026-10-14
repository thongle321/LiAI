# Voice feature (TTS) — PocketPal parity on sherpa-onnx

Date: 2026-10-13. Status: **implemented on `integration/voice-tts` (coding-only run, 2026-10-13); device proof pending first device session.** Produced by a
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
| Q2 | Engines v1 | **System (expo-speech) + Kokoro (sherpa)** behind a PocketPal-shaped `Engine` interface. **REVERSED 2026-10-14: Kitten + Supertonic ship too** (see Q2 reversal below) |
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
- Kokoro speakers beyond the curated 11
- Supertonic's language picker and diffusion-steps control, which PocketPal
  exposes and we cannot: sherpa-onnx 0.4.4's `TtsSupertonicModelOptions` is
  an empty interface, so there is no knob to turn. Revisit when the library
  grows them.
- STT (its own design: `expo-speech-recognition` vs sherpa's STT + native
  mic capture — that choice was never grilled and must not be assumed)

### Q2 reversal (2026-10-14)

The original deferral rested on a wrong premise, found during the build of
the three-engine screen: **Kitten and Supertonic are NOT blocked on
PocketPal's private speech fork.** They looked blocked because PocketPal
implements them in `@pocketpalai/react-native-speech` — but that fork is
PocketPal's, not a requirement. `react-native-sherpa-onnx` 0.4.4 supports
both natively:

```
TTSModelType = 'vits' | 'matcha' | 'kokoro' | 'kitten' | 'pocket'
             | 'zipvoice' | 'supertonic' | 'auto'
```

and publishes both models in the same `tts-models` release this app already
downloads from. So the deferral was costing us two engines for no reason.

What shipped: one `createNeuralEngine` factory over a per-engine table
(`lib/tts/engineMeta.ts`), one `EngineId` union carrying three neural
engines, and a per-engine download map in the store. Model ids and archive
sizes are measured from the release, not taken from the reference design
(see Q14 below).

Debt carried forward:

1. **Kitten/Supertonic voice tables are UNVERIFIED.** Kokoro's sid->name
   order is pinned to sherpa's own `generate_voices_bin.py`; no equivalent
   generator exists for the other two, so their orders are PocketPal's
   carried over. `getNumSpeakers()` only catches a count change, never a
   reorder. Correct both from a device reading before trusting them.
2. **Nothing has run on a device.** No sherpa TTS API has ever been
   exercised on hardware in this project; three engines triples the surface
   that first-device-session debugging will hit.
3. **Spec lines print our real numbers, not the design's.** The design says
   "22 voices / 330 MB" because that is PocketPal's *different* kokoro model
   (`onnx-community/Kokoro-82M-v1.0-ONNX`, fp32, per-voice .bin files).
   Ours is the int8 `kokoro-int8-en-v0_19`: 11 voices, 103.2 MB. Peak-RAM
   figures are absent entirely — the reference's were measured on its
   authors' hardware, and ours would be a guess.

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
- Runtime: `playbackState` (`idle | playing` + messageId — the `streaming`
  variant arrives with phase-2 streaming playback), per-engine
  `DownloadState`/`Progress`/`Error` triplet, `deviceMeetsMemory`,
  `lastSpokenMessageId`, `pendingVoiceRestore` (in-memory voice stash).
  No `isSetupSheetOpen` — the UI stays the existing route, not a global
  sheet (quiz amendment 1).
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
| Strip cleaner (ported `ThinkingStripper` + Q10 rules) | `lib/stripForSpeech.ts` (top-level: shared with vision/chat, not engine-specific) |
| Download bridge to sherpa manager | `lib/tts/download.ts` |
| Store | `store/voice.ts` (extended in place — the existing system-TTS store, not a new module) |
| Setup sheet (house Sheet) + voice list + preview + AutoSpeakRow | `components/voice/KokoroEngineCard.tsx` + existing `components/voice/VoiceChip.tsx` + voice-settings route (kept, not a global sheet — quiz amendment) |
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

## Findings from ticket 02 (2026-10-13)

Answers to the open items above, verified against the installed 0.4.4
package (docs-vs-reality differences noted):

1. **Registry model IDs** (GitHub release tag `tts-models`):
   `kokoro-int8-en-v0_19` — 98.5 MB int8 English, the chosen tracer
   model; `kokoro-en-v0_19` — 304.8 MB fp32 sibling, same voices. The
   installed package exports category-first names (`downloadModel`,
   `refreshModels`, …), NOT the docs site's `downloadModelByCategory`
   spellings — the bridge wraps what the package ships.
2. **Speaker count: 11 (sid 0..10)** for the kokoro-en-v0_19 family.
   This revises ticket 04's “~20 curated voices” to **11 named voices**.
   The sid→name order was later pinned from sherpa's own voices.bin
   generator — see “Docs audit” finding 1 below; it is no longer pending.
3. **PCM player is streaming-engine only.** The shipped `TtsEngine`
   (batch `createTTS`) declarations expose no `startPcmPlayer`; the
   player lives on `StreamingTtsEngine`. Pre-authorized fallback taken:
   `speakOnce` uses `createStreamingTTS` + chunked `writePcmChunk` —
   design unchanged.

Device/Gradle proof: **out of scope this run** (coding-only constraint in
the amendments above); `KokoroTracer` (__DEV__-only card in Voice
settings) is the manual smoke surface for the first device session.

## Findings from the sherpa-onnx docs audit

Comparing the implementation against the published docs (TTS + Advanced
sections) and the installed 0.4.4 source:

1. **sid→name order was wrong for 7 of 11 voices — corrected.**
   The authoritative order is sherpa-onnx's own voices.bin generator,
   `scripts/kokoro/v0.19/generate_voices_bin.py`, whose `id2speaker` is
   `af, af_bella, af_nicole, af_sarah, af_sky, am_adam, am_michael,
   bf_emma, bf_isabella, bm_george, bm_lewis`. The shipped list had been
   taken from PocketPal, whose model is a **different one**
   (`onnx-community/Kokoro-82M-v1.0-ONNX`, 22 English voices addressed by
   per-voice `.bin` filename). Names were therefore right for PocketPal and
   wrong here — sherpa addresses this model by integer sid, so every voice
   past index 4 was mislabelled (tapping “Adam” played `bm_george`). Fixed;
   a test now asserts the id order against that generator.
2. **`numThreads` + `provider` were never passed** (Q2). Defaults are CPU
   and 2 threads; sherpa's provider table puts NNAPI at 2–4× on Android and
   Core ML at 2–3× on iOS. Now resolved once per run, CPU fallback.
3. **`getNumSpeakers()` is now called** and warns on a count mismatch
   (Q3). It cannot catch a pure reorder — the generator script is what
   settles that — so it is a tripwire for a model swap, not proof.
4. **Model removal added** (Q4). `deleteModel` is wired through the bridge,
   store and card. A pre-download disk-space check was **not** added: the
   manager already runs `checkDiskSpace(model.bytes)` inside `downloadModel`
   and throws `Insufficient disk space`, which the bridge already surfaces
   as `state: "error"`.
5. **Background downloader needs no configuration** (Q5). The library calls
   `ensureAndroidBackgroundDownloaderNotifications()` itself when the host
   app has not configured it, so `configureBackgroundDownloader` would only
   restyle notifications. Nothing wired.
6. **Docs are newer than the installed package.** They document
   `refreshModelsByCategory` / `downloadModelByCategory` /
   `getLocalModelPathByCategory` and model types `pocket`/`zipvoice`; 0.4.4
   exports `refreshModels` / `downloadModel` / `getModelPath`. Code follows
   the installed package. Separately, the docs' own Kokoro page shows
   `createTTS(...)` calling `startPcmPlayer`/`generateSpeechStream`, which
   contradicts its API reference — the player is streaming-only, as shipped.

## Risks

- `react-native-sherpa-onnx` is a 0.x, single-maintainer package (0.4.4,
  2026-09-08, actively maintained).
- Gradle fetches native libs at build time — network needed against the
  committed `android/`.
- npm auto-installs two extra native peer deps (Q6 approved).
- Research was docs/code-only; no sherpa API has been exercised on a
  device yet — open item 3 is the likeliest surprise.
