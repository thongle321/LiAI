Status: done
Type: task
Blocked by: 01,02,03,04,05,06,07

# Ticket 08 — Resolve remaining feature gaps, replace static guards, and clean migration

Complete migration closure: resolve all failing tests or record follow-ups,
implement any missing feature gaps discovered but not already handled,
selectively replace high-value static source guards with behavior tests,
remove legacy temporary node-test dependencies, and verify the full migration.

## Acceptance

- [x] Core slices (chat, model management, inference, storage, voice, vision,
      search, settings, onboarding) have green behavior tests.
      Chat, model settings, inference, storage, voice/TTS, vision gate,
      search and settings are green. Onboarding has no tests — recorded as
      ticket 12, along with the gaps in tickets 09–11 and 13–16.
- [x] Unresolved tests are either fixed or documented as follow-up tickets.
      Tickets 09–17 under `issues/`; the inventory no longer claims coverage
      the suite does not have.
- [x] High-value migration invariants previously guarded by static source tests
      are replaced with behavior tests where practical.
      Two of the three `store/chat` source guards are now behavior tests;
      the third (the streaming-yield wiring) is removed and recorded in
      ticket 17.
- [x] Legacy migration artifacts are removed after successful validation.
      `tests/legacy/` (~130 files) is deleted; `tests/tsconfig.json` no
      longer excludes it.
- [x] `npm run typecheck` passes.
- [x] `npm test` runs the Jest suite successfully. 26 suites, 335 tests.
- [x] Spec status can be updated to done once acceptance is met.

## What this pass changed

- Ported tests use Jest matchers; the `const assert: any = {...}` facade is
  gone from all 17 files that had it.
- `@expo/ui` is stubbed by a real component module instead of `() => ({})`.
- Router navigation is assertable through the shared `routerMock`
  (`jest/router-mock.ts`), reset between tests.
- `__mocks__/external/` gained typed mocks for `expo-speech`,
  `expo-speech-recognition`, `expo-sqlite`, `expo-linking` and `expo-font`,
  anchored in `jest.config.js` so `@expo/ui` subpath imports still resolve.
- Shared helpers live in `jest/` (`router-mock.ts`, `source.ts`,
  `storage.ts`) and are used by more than one suite each.
- `tests/route-smoke.test.tsx` now asserts real navigation, and
  `tests/module-boundary-mocks.test.tsx` imports every boundary mock.

## Context pointers

- Spec: `.scratch/jest-test-migration/spec.md`
- Inventory: `.scratch/jest-test-migration/test-inventory.md`
- Follow-ups: `.scratch/jest-test-migration/issues/09…17`
- All previous tickets and their associated batches of tests.
