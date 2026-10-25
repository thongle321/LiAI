# Research: PocketPal Phonon voice engine (#1009) parity

Ref commit: `b4e82f7c` (48 files, +3444/-188) in vendored `pocketpal-ai/`.
LiAI port status: the restructure landed in omnibus commit `7e86e98 "Update"`
(the parity doc's stale "IN PROGRESS (WIP, uncommitted)" note refers to this).
This note closes item 2: what landed, what `b4e82f7c` adds that LiAI was
missing, and where each decision came from.

## What PocketPal's commit contains (primary sources)

- **Native deps**: `@pocketpalai/react-native-speech-phonon` 0.1.3 with peer
  `@pocketpalai/react-native-speech` >=2.7 <2.9 (`pocketpal-ai/package.json`,
  `ios/Podfile.lock:2414`). iOS is pod autolink only; no config plugin.
- **Engine registry**: `EngineId` gains `'phonon'`
  (`pocketpal-ai/src/services/tts/types.ts:13`); registry order phonon,
  kitten, kokoro, supertonic, system (`engineRegistry.ts`).
- **Engine impl**: `pocketpal-ai/src/services/tts/engines/phonon/index.ts`
  — `Speech.registerEngine(new PhononAddonEngine())`, HF-pinned downloads,
  SHA-256 verification, version sentinel (`phonon/constants.ts`,
  `manifest.ts`, `voices.ts`).
- **Support gating**: `Speech.getEngineSupport(PHONON)` probe →
  `phononSupported` in TTSStore (`store/TTSStore.ts:184`), refreshed in
  `init()` (`:246`) and again after a Phonon load failure
  (`refreshAfterPhononFailure`, `:372`). `isEngineOffered(id)` hides Phonon
  from UI when unsupported (`:335`); VoicePickerView filters
  `ENGINE_ORDER.filter(id => ttsStore.isEngineOffered(id))` (VoicePickerView.tsx:599).
  When the probe turns unsupported while a Phonon voice is selected, the
  store stops playback, releases the runtime, and clears the voice to null
  WITHOUT stashing it — its model files stay on disk because deleting them
  would void the add-on's recorded load failure (`refreshPhononSupport`,
  `:344-370`).
- **Per-engine runtime bytes**: `TTS_ENGINE_RUNTIME_BYTES`
  (`pocketpal-ai/src/services/tts/constants.ts:16`) — phonon 200 MiB,
  kitten 200 MB, kokoro/supertonic 500 MB — consumed by voice-mode memory
  fit as the `tts` row (`hooks/useVoiceMode.ts:180`,
  `services/voice/memoryFit.ts`). The blanket availability gate stays
  4 GiB (`TTS_MIN_RAM_BYTES`, `constants.ts:13` + TTSStore `:243`) — the
  per-engine table feeds the FIT ARITHMETIC, not the availability boolean.
  (So "Phonon wrongly blocked on <4 GiB" was mis-scored in our earlier
  audit: PocketPal gates availability globally too.)
- **Tests**: 577-line `PhononEngine.test.ts`, `catalogGuard.test.ts`,
  `manifest.test.ts`, `publishGate.test.ts`, store + writer tests, e2e
  memory profile.
- **Out of parity scope** (deliberate): third-party notices/About screen
  (LiAI has no About screen), sync-phonon-notices script, automation
  harness, locales.

## LiAI state before this close-out

Landed in `7e86e98`: deps (package.json:13-14), jest mock with
`getEngineSupport` (`__mocks__/external/@pocketpalai/react-native-speech.ts:120`),
per-engine catalog + registry + engine impls (`services/tts/engines/*` per
directory), Phonon engine with HF pins/sentinel/delete
(`services/tts/engines/phonon/index.ts`), per-engine downloads store with
4 GiB gate (`store/voice.ts:51`), engine-card UI
(`components/settings/voice-settings.tsx:147` + `components/voice/engine-card.tsx`).

Gaps found:

1. `getPhononSupport()` exists
   (`services/tts/engines/phonon/index.ts:38`, re-exported
   `engineRegistry.ts:42`) but is never called — dead code. No
   `phononSupported`, no `isEngineOffered`, no unsupported-clear path. Every
   device sees Phonon as installable.
2. No per-engine runtime-byte table; `hooks/useVoiceMode.ts:194` keeps the
   item-1 placeholder `ttsBytes: 0` — the memory-fit arithmetic omits the
   TTS row entirely (tight is unreachable... only wont_fit/fits).
3. Test coverage deleted in `7e86e98` and never restored:
   `services/tts/__tests__/engines.test.ts` (323 lines) and
   `services/tts/__tests__/tts-download.test.ts` (107 lines). The Phonon
   engine has only an 8-line smoke test.
4. No spec / research note / review record for the restructure (this file +
   `docs/specs/2026-10-25-phonon-engine-parity.md` close that).

## Verdict

PARTIAL — core port committed, gaps above. This session's spec closes 1-4;
device verification of the native module stays pending (needs a dev-client
rebuild; unreachable from `bun run test`).
