# PocketPal #1017 "One Whisper model for dictation and voice mode" — port fact-check

Source: vendored `pocketpal-ai/` at HEAD `4a76784b` (the #1017 commit is the tip).
Plan doc: `docs/plans/pocketpal-new-release-parity.md` item 1. Verified 2026-10-25.

## What the commit actually is (delta, not the feature)

The commit Nachricht says "one Whisper model for dictation and the voice mode",
and the reference app already had Whisper-driven voice mode BEFORE it (its
`useVoiceMode` controller + `CascadeVoiceEngine` + `Endpointer` + `AudioRecord`,
landed with #1007). `4a76784b` itself adds the **single shared tier policy** on
top of both consumers:

- `ASR_DEFAULT_TIER` `'small'` → `'base'` ("fast on every measured phone").
- `ASRStore.selectTier(tier)` (public, ready-gated) replaces unconditional
  selection. `setSelectedTier` becomes private, used by reconcile / first
  install / delete fallback only.
- `downloadModel(tier)` loses its `{select}` option: the tier becomes in-use
  **only when no tier was ready yet** (`firstInstall = !isSelectedTierReady`
  computed AFTER `await this.reconciled`). A download while another tier is in
  use does NOT switch to it.
- `deleteModel` falls back through `fallbackTier()` = first ready tier in
  `ASR_TIER_ORDER`, else default.
- `init()` reconcile waits for hydration (`Promise.all([disk scan, hydrated])`),
  tracked as `this.reconciled`; `downloadModel` awaits it before deciding
  first-install. Files: `src/store/ASRStore.ts`.
- `setupTier` getter: `selectedTier` once ready, else default — what a setup
  sheet offers (never a stale uninstalled persisted tier).
- Engine hardening: `transcribe(pcm, opts)` opts REQUIRED (no silent `'small'`
  fallback); `src/services/asr/engines/whisper/index.ts` + `types.ts`.
- Tier threading: `memoryFit` takes `sttTier: AsrTier` and resolves runtime
  bytes itself; the fit ECHOES `sttTier` (`continueAnyway` re-validates with
  it). `CascadeVoiceEngine.prepare(tier)` / `preload(tier)`; a turn before
  `prepare` resolves `transcribe_failed`. `src/services/voice/{memoryFit,cascadeEngine,types}.ts`.
- UI: new `MicSetupSheet` (composer in-place setup, auto-close on ready,
  no close button, cancel leaves the download running), new `WhisperModelRow`,
  reworked `VoiceSetupSheet` (uses `setupTier`, plain `downloadModel`), settings
  section gets Use / In use (`asr-use-<tier>` → `selectTier`), `MicButton` press
  (no tier) opens the sheet in place instead of navigating to Settings.
- Locale keys renamed (`sttRowModel` = `Whisper {{tier}} · {{size}}`,
  `memorySttRowModel`, tier name/hint keys) — i18n out of scope for LiAI.

## Reference behavioral contract (tests consulted)

- `src/store/__tests__/ASRStore.test.ts`: fresh install default `base`;
  persisted×disk matrix (`small`+`[base]`→`base` etc.); selectTier ignores a
  not-installed tier; successful download does not switch a ready in-use tier;
  first install selects its tier; concurrent downloads → first finisher wins;
  delete of in-use tier falls through ready tiers in order, else default.
- `src/hooks/__tests__/useVoiceMode.test.ts`: `prepare` called with the
  selected tier; setup gate when tier absent even if `base` ready; memory
  breakdown stt row equals the tier's runtimeBytes; `continueAnyway` passes
  `fit.sttTier`, re-checks when the tier changed/uninstalled, enters otherwise.
- `src/components/MicSetupSheet/__tests__/MicSetupSheet.test.tsx`: default
  offer is `base` even while another tier downloads or selection is stale;
  downloading → disabled + progress; error → Retry; low disk line; auto-close
  unmounts and fires `onClosed`; cancel closes but keeps the download.

## LiAI mapping (what these become)

| PocketPal | LiAI |
|---|---|
| mobx `ASRStore` | zustand `store/asr.ts` (persist partialize already matches) |
| `selectTier` (ready-gated) | new store action, UI + sheets call it; `setSelectedTier` stays internal (reconcile/first-install/delete) |
| `downloadModel` unconditional select | first-install-only select |
| `readDeviceMemory` (chat `availableMemoryCeiling` for iOS) | LiAI has no per-model iOS ceiling reading; DeviceMemory = `{os, totalBytes}` from `readTotalMemory()`, budget = `totalBytes × osShare` (identical formula to LiAI's existing `fitsCaptureMemory`) |
| `TTS_ENGINE_RUNTIME_BYTES` | NOT PORTED — LiAI's recorded decision says TTS RAM figures are unmeasured and must not be invented (`services/tts/engineMeta.ts` header). The memory sheet counts chat + whisper only. |
| `isVoiceModeVoice` (neural voice required) | NOT REQUIRED — LiAI auto-speak runs through the same voice store for system voices; any selected voice (or the system default) answers |
| mobx `when` / reactions | subscribe/poll promises over zustand subscriptions |
| `AudioRecord` 50 ms chunks | `@siteed/audio-studio` `useAudioRecorder`, 50 ms PCM events feeding the ported `Endpointer` |
| `ChatScreen` popover + `voiceModeStore` presentation/mute/teaser | the voice tab owns the session; phase lives in the hook state; tease/paywall and mute have no home in LiAI (no Plus, no mute button) |
| `androidVoiceSpeechStarted`/`voiceStreamFailed` per-turn TTS book-keeping | LiAI's voice store lacks the per-turn exposure; `speech_failed` is not detected — recorded divergence |
| chat port (`useChatSession`) | `useChatStore.send(text, undefined, {voiceMode:true})` + `stop()` |
| `requestIdleCallback` before engine release | plain `await` (RN global) — LiAI has no voiceTrace util |

## Verdict

Port item 1 as: store policy slice → engine hardening → endpointer →
memory-fit → cascade engine → `useVoiceMode` controller on the voice tab →
sheets + composer mic + settings rows. Native work: none (whisper.rn already
verified for dictation). Captions change from interim word-by-word to
per-utterance (batch Whisper) — accepted, matches PocketPal.
