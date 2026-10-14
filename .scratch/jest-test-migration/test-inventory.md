# Jest migration test inventory and follow-ups

Verified state:

- Command: `npm run typecheck` — pass.
- Command: `npm test` — pass: 26 suites, 326 tests.
- Runner: Jest via `jest-expo`, route filename guard still runs before tests.
- Location: colocated `__tests__/` tests and a small route smoke test under `tests/`.
- No test files exist under `app/`.

## Current Jest coverage

| Area | Suites | Representative coverage |
| --- | --- | --- |
| Infrastructure/smoke | 2 | Jest harness, inline Expo Router rendering |
| Chat stores and turns | 2 | session lifecycle, send/stream, retry/regenerate/edit, warnings, import, message identity |
| Storage/session store | 1 | TinyBase session persistence behavior |
| Inference | 8 | engine, manager, sampler, device selection, params, local/remote engines, vision gate |
| Model settings/storage | 3 | model settings, model file state, storage disclosure |
| Voice/TTS | 2 | voice status, TTS engine behavior |
| Search/settings | 2 | agent search behavior, search settings state |
| Hooks | 3 | model-ready gate, multimodal composer gate, storage disclosure hook |
| Component UI | 1 | chat pending status row |

## Deferred follow-ups

1. Expand component/UI coverage beyond the pending status row for critical chat, models, settings, voice, vision, onboarding, and search surfaces.
2. Convert remaining high-value static guards and legacy test knowledge into Jest behavior tests before deleting the archive.
3. Add behavior tests for additional LiAI hooks (`useChatImport`, `useContextLadder`, `useVoiceLoop`, `useVoiceOffload`, `useWatchMode`, `useVisionTurn`) as features are touched.
4. Add real screen/route behavior tests using the verified inline-router smoke harness for chat, vision, voice, models, settings, and onboarding.
5. Decide whether `tests/legacy/` is retained temporarily as an unexecuted reference or deleted after its valuable guards are replaced.
6. Revisit coverage thresholds only after the deferred component/route follow-ups land.
