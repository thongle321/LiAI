Status: ready-for-agent
Type: task
Blocked by: 08

# Ticket 15 — Voice, TTS, and vision runtime plus remaining hooks

Voice and TTS have their engine factories covered
(`lib/tts/__tests__/engines.test.ts`, `lib/__tests__/voiceStatus.test.ts`),
but the runtime that drives them does not.

Retired guards:

- `voice-lifecycle`, `voice-throttle`, `voice-status`, `voices`,
  `voice-download`, `voice-settings`, `voice-ui`, `dictation` — the voice
  store's phase machine, the throttle window, the engine tag, the curated
  voice list, engine download states and the rule sets that decide what the
  Voice settings screen renders (`lib/voiceStatus.ts`, `lib/voices.ts`,
  `lib/voiceListen.ts`, `lib/voiceUi.ts`, `store/voice.ts`).
- `tts-oneshot`, `tts-runtime`, `tts-download`, `strip-for-speech` — the
  one-shot speak path, engine runtime switching, download bridge, and the
  markdown-to-speech stripper.
- `vision-pairing`, `vision-watch`, `vision-remote`, `vision-truth`,
  `vision-activation` — projector pairing, the watcher that re-gates on
  model switch, remote vision, and the vision screen's activation rules.
  (`lib/models/vision-pairing.ts`, `lib/vision-watch.ts`.)

Hooks with no coverage at all, from the retired inventory:
`useChatImport`, `useContextLadder`, `useVoiceLoop`, `useVoiceOffload`,
`useWatchMode`, `useVisionTurn`. The new native mocks for `expo-speech`,
`expo-speech-recognition`, `expo-keep-awake` and `expo-haptics`
(`__mocks__/external/`, see `tests/module-boundary-mocks.test.tsx`) are what
make `useVoiceLoop` and `useVisionTurn` reachable at all.

## Acceptance

- [ ] `store/voice.ts` phase machine and throttle have behavior tests.
- [ ] `lib/stripForSpeech.ts`, `lib/voiceListen.ts`, `lib/voiceUi.ts`,
      `lib/voices.ts` have behavior tests.
- [ ] `useVoiceLoop` and `useVisionTurn` have at least one renderHook test
      covering the mic-grant / denial / unavailable branches of
      `lib/micAccess.ts`.
- [ ] Vision pairing and watch rules have behavior tests.

## Context pointers

- Existing seam: `tests/fakes.ts`, `lib/store/voice.ts` injection
- Native mocks: `__mocks__/external/expo-speech.ts`,
  `__mocks__/external/expo-speech-recognition.ts`
- Retired guards: `git show HEAD~1:tests/legacy/voice-*.test.legacy.ts`,
  `.../tts-*.test.legacy.ts`, `.../vision-*.test.legacy.ts`
