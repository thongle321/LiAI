# Spec: close out the Phonon voice engine port (parity item 2, #1009)

Source: the core restructure landed in `7e86e98`; this spec covers only the
gaps to PocketPal's `b4e82f7c` (see the research note
`docs/research/2026-10-25-pocketpal-phonon-engine-parity.md`). Decisions
mirror the reference — no new abstractions.

## In scope

### 1. Phonon support gating (S1 + S2)

- `store/voice.ts` gains `phononSupported: boolean` (default `false`) and
  `isEngineOffered(id)`: true for every neural engine; for `phonon`, true
  only while `phononSupported`.
- `load()`/`hydrate()` runs `refreshPhononSupport()` once: probe
  `getEngineSupport(PHONON)`; `{ supported, reason }`. A throw counts as
  unsupported (`reason: "error"`), same as the reference.
- When the probe says unsupported while `currentVoice.engine === "phonon"`:
  stop playback (`stop()`), and clear `currentVoice` to the device default
  WITHOUT stashing the id — the model files stay on disk and the stash path
  (restore-after-download) belongs to downloads, not support loss
  (reference clears to null; LiAI's null means device default).
- `components/settings/voice-settings.tsx` renders only
  `ENGINE_ORDER.filter((id) => isEngineOffered(id))`.
- A Phonon play/load failure re-probes support (reference's
  `refreshAfterPhononFailure`), wired into the streaming handle's failure
  path where the runtime reports the engine id — smallest version: hook the
  re-probe off `startEngineDownload`/`play` failures for phonon only.

### 2. Per-engine runtime bytes (S3)

- `TTS_ENGINE_RUNTIME_BYTES: Record<NeuralEngineId, number>` in
  `services/tts/constants.ts`, copied from the reference: phonon
  200 × 1024 × 1024, kitten 200_000_000, kokoro 500_000_000,
  supertonic 500_000_000.
- `useVoiceMode.ts` passes the selected voice's engine bytes as `ttsBytes`
  (system voice → 0), replacing the `ttsBytes: 0` placeholder at line 194.
  The blanket 4 GiB `RAM_GATE_BYTES` availability gate is UNCHANGED — the
  table feeds the fit arithmetic only.

### 3. Restored test coverage (S4)

- `services/tts/engines/phonon/__tests__/phonon-engine.test.ts`: download
  verifies all pinned files (status, size, sha256), writes the version
  sentinel + curated voices jsonl (Android iOS divergence), cleans the
  model dir on failure, `isInstalled` requires every file + current
  sentinel, `deleteModel` removes the dir.
- Catalog/registry coverage restored at the new layout: engine order, one
  meta row per engine with measured modelBytes, registry lookups incl. the
  unknown-id throw.

## Out of scope (recorded)

- About/third-party notices screen (LiAI has none), automation harness,
  locales; pause/resume downloads (PocketPal engines don't support pause —
  LiAI's cards show pause state maps to this no-op, unchanged).
- Device verification of the native module (dev-client rebuild; stays the
  manual gate).
- The blanket 4 GiB gate itself (matches the reference).

## Verification

`bun run typecheck` + `bun run test` green; parity doc item 2 re-statused
with device verification pending.
