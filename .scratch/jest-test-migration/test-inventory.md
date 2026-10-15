# Jest migration test inventory and follow-ups

Verified state (after the `feat/jest-test-migration` review pass):

- Command: `npm run typecheck` — pass (root project + `tests/tsconfig.json`).
- Command: `npm test` — pass: 26 suites, 335 tests.
- Runner: Jest via `jest-expo`, route filename guard still runs before tests.
- Location: colocated `__tests__/` tests plus `tests/` for the router harness
  and the boundary-mock smoke test.
- No test files exist under `app/`.
- No `any` in any test file; no hand-rolled `assert` facade remains.

The old Node `--test` suite under `tests/legacy/` (~130 files) is deleted.
Unported guards became tickets 09–17 under `issues/`.

## Current Jest coverage

| Area | Suites | Representative coverage |
| --- | --- | --- |
| Infrastructure | 2 | Expo Router testing harness, Link + `routerMock` navigation, `@expo/ui` stub, native module boundary mocks |
| Chat store and turns | 1 | session lifecycle, send/stream, retry/regenerate/edit, warnings, import, message identity, multimodal gate re-checks |
| Chat turn + storage | 2 | local turn runner, TinyBase session persistence, lazy hydration, corruption guards |
| Inference | 8 | engine, manager, sampler, device selection, params, local/remote engines, vision gate |
| Model settings/storage | 3 | model settings, model file state, storage disclosure |
| Voice/TTS | 2 | voice status labels, TTS engine + registry behavior |
| Search/settings | 2 | agent search (clip, cache, providers), search settings state |
| Hooks | 3 | model-ready gate, multimodal composer gate, storage disclosure hook |
| Component UI | 1 | chat pending status row |

## Deferred follow-ups

1. **Ticket 09** — chat/session guards not yet ported: composer drafts,
   export, import edge cases, bulk session ops, attachments, turn
   blocks/rows, keep-awake.
2. **Ticket 10** — model download lifecycle: resume, retry, preflight,
   error copy, and the native download driver.
3. **Ticket 11** — GGUF metadata, memory estimation, context ladder/fit,
   model catalog and Hugging Face surface.
4. **Ticket 12** — onboarding flow behavior tests (welcome → model → done).
5. **Ticket 13** — component and UI coverage beyond the pending row
   (chat, models, settings, voice, vision, a11y/contrast/touch sweeps).
6. **Ticket 14** — real screen/route behavior tests through the verified
   `renderRouter` harness (chat, models, drawer, layouts).
7. **Ticket 15** — voice/TTS/vision runtime, and the six hooks with no
   coverage (`useChatImport`, `useContextLadder`, `useVoiceLoop`,
   `useVoiceOffload`, `useWatchMode`, `useVisionTurn`).
8. **Ticket 16** — agent runner, talents/allowlist, reasoning and thinking
   detection, offload, remote capability negotiation.
9. **Ticket 17** — the review-corrections record, including why
   `@react-native/jest-preset` is a required peer of `jest-expo` and cannot
   be removed.

## Deliberate non-goals for this slice

- **Coverage thresholds** stay off until tickets 09–16 land (`tests/`
  baselines are unknown, and a threshold now would block porting).
- **Multi-platform universal pass** (`jest-expo/universal`) stays out until
  the single-platform suite is green end to end.
- **Retaining `tests/legacy/` as reference**: deleted, per ticket 08's
  acceptance. The files remain in git history at `HEAD~1` and the tickets
  above point at them.

## Known judgement calls left in place

- The two hook `seed()` helpers (`hooks/__tests__/useModelReady.test.ts`,
  `useMultimodalAvailable.test.ts`) are near-identical. They carry each
  suite's own baseline store shape, so they were left local rather than
  forced into one shared helper.
- Three suites still read repo source text (`remote-engine` timeout wiring,
  `tinybase-store` lazy hydration, `vision-gate` composer gating) — now
  through the root-anchored `jest/source.ts` helper rather than cwd-relative
  paths. They are recorded here and revisited with tickets 13/14.
