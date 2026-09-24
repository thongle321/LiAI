# ADR-0011: QVAC replaces llama.rn for on-device inference

Date: 2026-09-25
Status: Accepted
Supersedes: ADR-0008 (llama.rn inference choice)

## Context

ADR-0008 put on-device GGUF inference behind a `CompletionEngine` seam with
`llama.rn` as the engine. A QVAC spike (pinned `@qvac/sdk 0.20.0`) reproduced
the seam behind a QVAC adapter — streaming text, tool calls, image
attachments, cancellation — and the user directed a full replacement:
QVAC takes over everything llama.rn did, with no llama.rn fallback.

## Decision

- **QVAC is the only local engine.** `loadModel`/`completion`/`cancel`/
  `unloadModel` from `@qvac/sdk` serve GGUF turns through the existing
  `CompletionEngine` seam (`lib/inference/qvac-engine.ts`). `llama.rn`
  (dependency, Expo plugin, wrapper, tests) is deleted.
- **Same seam, same slot.** The `EngineManager` one-slot lifecycle is
  unchanged; only the loader body changes (QVAC modelId instead of llama
  context). Local-first file resolution and remote BYOK fallback are
  untouched.
- **CPU defaults.** Loads use `{ ctx_size: 2048, device: "cpu" }` globally;
  per-model tuning waits on device numbers. GPU offload stays evidence-gated.
- **Vision pairing stays deferred.** Neither engine had mmproj discovery;
  the adapter already maps `projectionModelSrc`/attachments, so vision
  lights up when pairing lands (separate decision).
- **Models stay ours.** HF direct downloads feed local file paths into QVAC;
  the QVAC registry is not adopted.

## Consequences

- One native inference stack (QVAC plugin) instead of two; Expo Go stays
  unsupported, EAS dev-client workflow unchanged.
- Device proof (scripted text/tool/cancel/image bar) still runs on hardware
  via the temporary proof screen, deleted afterwards.
- SDK pinned exact; upgrades are deliberate (fast upstream cadence).
