# Voice: one Whisper model for dictation and voice mode

Port of pocketpal-ai #1017 (`4a76784b`) onto LiAI. Research:
`docs/research/2026-10-25-pocketpal-one-whisper-parity.md`. Scope decisions
(user, this session): port the PocketPal harness (controller + cascade engine
+ endpointer + memory fit), default tier `base`, full memory-fit sheet.

## Goals

1. Voice mode stops using OS STT (`expo-speech-recognition`); it runs Whisper
   STT with energy-VAD endpointing, like dictation. The ONLY remaining OS-STT
   consumer is `hooks/useVisionTurn.ts` (out of scope).
2. ONE persisted `selectedTier` shared by dictation and voice mode, under the
   #1017 selection policy (ready-gated select, first-install auto-select,
   ready-stays-instead-of-switch, delete fallback, default tier `base`).
3. Memory-fit gating before voice entry with a breakdown sheet
   (`VoiceMemorySheet`), and an in-place `MicSetupSheet` in the composer.

## Non-goals

- PocketPal's Plus/teaser gate, mute control, presentation popover, and audio
  interruption wiring (no supporting surface or native module on the LiAI side
  for STT).
- Per-turn `speech_failed` detection (voice store lacks the per-turn speech
  book-keeping the reference has).
- Translations (LiAI has no i18n; strings are English, placed like the
  reference's `voiceInput`/`voiceMode` keys).

## Store contract (`store/asr.ts`, zustand — behavior, not mobx)

- `ASR_DEFAULT_TIER = "base"` (`services/asr/constants.ts`).
- New action `selectTier(tier)`: commits ONLY when `downloadStates[tier] ===
  "ready"`; otherwise a no-op. `setSelectedTier` remains for reconcile,
  first-install select and delete fallback (internal; UI never calls it).
- `downloadModel(tier)`: re-entrant guarded; on success selects the tier ONLY
  when no tier is ready yet. Failure paths unchanged (error slot + sentinel).
  New `retryDownload(tier)` alias (the setup sheets call it).
- `deleteModel(tier)`: re-entrant guarded; falls back through ready tiers in
  `ASR_TIER_ORDER`, else default; same as today otherwise.
- Derived helpers (pure, exported): `setupTier(selectedTier, downloadStates)`
  = selected tier once ready, else default; `selectedTierState`. Consumed via
  the `asrStore` façade getters and `useAsrStore` selectors.

## Engine contract (`services/asr/`)

- `AsrEngine.transcribe(pcm, opts)` — `opts` REQUIRED (`{tier, ...}`)
  (reference: silent `'small'` fallback removed).
- `AsrEngine.preload(tier)` — loads the context for `tier` without
  transcribing; the cascade engine's `prepare` awaits it. Mocks/fixtures and
  the store factory fake get the new member.
- Engine implementation (`engines/whisper.ts`): `preload(tier) =
  ensureContext(tier)`; step unchanged otherwise.

## Voice services (`services/voice/`)

- `constants.ts` (new): `VOICE_ENDPOINT_HANG_MS = 600`,
  `VOICE_CAPTURE_SETTLE_MS = 150`, `VOICE_MIC_WATCHDOG_MS = 3000`,
  `VOICE_START_TIMEOUT_MS = 45_000` (reference values, verbatim).
- `endpointer.ts` (new): port of reference `Endpointer` — utterance VAD: a
  pause ≥ hang after ≥ `ASR_MIN_SPEECH_MS` of voiced audio, or
  `ASR_MAX_SEGMENT_MS` cap; lead-in trim; `take()`/`reset()`/`tap()`.
  Minus `vtrace` traces.
- `memory-fit.ts` (new): `DeviceMemory = {os, totalBytes}`,
  `memoryBudget(memory)` = `totalBytes × (ios ? ASR_IOS_CEILING_SHARE :
  ASR_ANDROID_RAM_SHARE)`, `whisperFits(memory, chatBytes, whisperBytes)`,
  `voiceMemoryFit({memory, chatBytes, sttTier, ttsBytes})` →
  `{status: fits|tight|wont_fit, sttTier, breakdown: {rows, neededBytes,
  availableBytes}}`. TTS row rendered/added only when `ttsBytes > 0`
  (LiAI has no measured engine RAM — recorded divergence).
- `cascade-engine.ts` (new): `prepare(tier)` = `whisperAsrEngine.preload(tier)`;
  `release()` = whisper release; `runTurn(utterance, port, on)`:
  re-VAD → transcript via the asr engine (with the `chatBusyOnCpu` wait and
  `spokenLanguage`) → `on.transcribed(text)` → `port.send(text, onTurnCreated)`
  → await TTS idle (`playbackState.mode === "idle"`) → outcome
  `answered | empty | interrupted | transcribe_failed | reply_failed`.
  Idempotent `interrupt()`: before send → `cancelTranscription()`; during →
  voice store `stop()` + `port.stop()`.
- `VoiceTurnPort` (new, in `services/voice/types-voice.ts`... same file as the
  engine types): `send(text, onTurnCreated)` resolves when the turn settles;
  `stop()` = the chat store's Stop.

## Controller (`hooks/useVoiceMode.ts` — replaces `useVoiceLoop.ts`)

Phases (reference set): `closed | starting | listening | transcribing |
thinking | speaking`. Session machine ported:

- Entry: `requestEntry` → model-not-ready issue → setup gate (tier ready +
  mic granted) → `VoiceSetupSheet`; else `checkMemoryAndEnter` → fit/wont
  sheet → `enter(tier)`. The gate CHECKS the mic
  (`checkMicAccess()` — check-only, never prompts); two recorded
  exceptions bypass the sheet because LiAI's sheet has no settings
  affordance: a PERMANENT mic denial and a stale dev build surface their
  existing issue lines (the denied one riding Open Settings).
- `enter`: keep-awake, `speaking`-stop, `withStartTimeout(engine.prepare(tier))`,
  → listening + capture. Failure → exit with issue.
- Capture: audio-studio recorder, 50 ms PCM, `Endpointer.push` → `endpoint` →
  `endUtterance` (mic stopped, phase per engine events, auto-restart on turn
  done); mic watchdog (one restart, then exit); settle hold between starts.
- Mic tap: listening+speech → end utterance; in a turn → interrupt; idle →
  nothing (closed screen taps start a session).
- Exits: End button, background, unmount, fatal mic failure; reply failures
  surface the issue copy and auto-return to listening (tap-to-talk feel like
  today's screen; no auto listen restart loops).
- Returns: `{ phase, heard, reply, issue, needsMicSettings, sheet,
  requestEntry, dismissSheet, setupDone, continueAnyway, tapCloud, end }`

## UI

- Composer: `components/voice/mic-button.tsx` — self-gating mic; not-ready
  press opens `components/voice/mic-setup-sheet.tsx` IN PLACE
  (Keyboard.dismiss first; keeps `mic-button` / `mic-button-setup` testIDs).
  Replaces the current `/voice-settings` navigation.
- `components/voice/whisper-model-row.tsx`: tier name/size/status row for
  sheets (progress "X of Y", low-disk line, error line).
- `mic-setup-sheet`: offers `setupTier`, install/retry/disabled-downloading,
  Cancel (leaves a running download), auto-closes + `onClosed` when ready.
- `voice-setup-sheet`: whisper row + mic status + Continue (downloads setup
  tier, then mic). No voice picker step (divergence above).
- `voice-memory-sheet`: breakdown bar + rows (chat / stt→"Speech
  recognition · Whisper <tier>" / tts when nonzero), Continue anyway only when
  not `wont_fit`, "Pick a smaller chat model" → Models screen.
- Voice tab (`app/(drawer)/(tabs)/voice.tsx`): same visual layout, driven by
  the new hook; phase labels gain Starting/Transcribing; captions show the
  transcript after each utterance; issue/retry/End affordances kept.
- ASR settings (`components/voice/asr-setup.tsx`): rows switch selection to
  `selectTier` (gated); tier names/hints come from
  `utils/asr-tier-label.ts` (base = default/fast; small = more accurate,
  slower; large-turbo = very slow).

## Tests (seams confirmed in plan; one suite per slice)

- `store/__tests__/asr-store.test.ts` — extend: selection policy matrix
  (first-install select, ready-stays, selectTier gate, delete fallback,
  re-entrancy, `setupTier`, default `base`).
- `utils/__tests__/asr-tier-label.test.ts` — copy table.
- `services/voice/__tests__/endpointer.test.ts` — ported endpoint cases.
- `services/voice/__tests__/memory-fit.test.ts` — fits/tight/wont_fit +
  sttTier echo + budget rules.
- `services/voice/__tests__/cascade-engine.test.ts` — tier threading,
  post-release `transcribe_failed`, interrupt semantics, outcome mapping
  (whisper.rn mocked via `__mocks__/external/whisper.rn.ts` +
  moduleNameMapper).
- `hooks/__tests__/useVoiceMode.test.tsx` — entry gates (setup/memory),
  Enter/End/turn wiring with a fake engine + fake port.
- Component tests beside the sheets/mic button + updated
  `voice-recording-bar`/`route-smoke` if impacted.

## Device risks

- No native changes; needs NO dev-client rebuild.
- Voice-mode latency: first Whisper load inside `prepare` (≤45 s watchdog).
- Mic/TTS overlap is impossible by construction (capture paused during a
  turn) — verify audio focus on device anyway.

## Verification status

- Unit/contract: 855 tests / 95 suites green (jest, 2026-10-25); typecheck
  clean. Nothing here is device-verified yet.
- On-device checklist (dev client already carries whisper.rn + audio-studio
  from the dictation port, so NO rebuild): (1) cold-start voice tab —
  setup-sheet order model → tier → mic-first-ask → memory; (2) a turn
  end-to-end — endpointer cut, transcript caption, reply caption + audio;
  (3) cloud tap interrupts mid-reply; (4) End + background exits; (5)
  mic-denied path opens OS Settings; (6) composer mic opens the in-place
  setup sheet on a fresh install.
