# LiAI Jest Test Architecture Migration

Status: ready-for-agent

## Problem Statement

LiAI is a multimodal AI companion built on Expo/React Native, but its current test architecture uses Node.js's built-in test runner against static source text. These tests mostly assert file contents and implementation details rather than real runtime behavior. As a result, LiAI cannot verify components, hooks, stores, or UI interactions the way the PocketPal reference app does, and feature parity work is hard to validate. The team wants to replace this testing architecture with PocketPal's Jest-based architecture and port applicable tests only for LiAI's actual feature set, using tests to surface and close missing feature gaps.

## Solution

Adopt Jest using `jest-expo`, with colocated Jest tests under non-route source directories and a shared mock/setup layer. Port and adapt PocketPal's behavior-focused tests for LiAI's implemented features only. Where a ported test exposes a missing capability, implement that capability. Migrate critical runtime behavior coverage first (chat, models, inference, storage, voice, vision, search, settings, onboarding), then hooks/components, then route-level behavior. Keep type safety and Expo Router route discovery intact by keeping test files outside `app/`.

## User Stories

1. As a LiAI contributor, I want real Jest behavior tests, so that component, hook, store, and utility behavior is verified instead of source text patterns.
2. As a contributor, I want a single Jest configuration, so that all colocated tests run consistently from one command.
3. As a contributor, I want Expo-compatible test setup, so that Expo SDK 57 dependencies can run under Jest.
4. As a contributor, I want native SDK modules mocked, so that tests can run in CI without devices and remain fast.
5. As a contributor working on chat, I want chat store tests to exercise real session and turn behavior, so that regressions in conversations, history, edit, regenerate, retry, and export are caught.
6. As a contributor on chat UI, I want RTL component tests with router mocks, so that message rendering, tool results, markdown, code blocks, composer, menues, and lists are validated.
7. As a contributor on models, I want model lifecycle tests, so that download state, memory fit, projector pairing, remote APIs, and model settings are validated.
8. As a models UI contributor, I want component tests around model cards, search, details, and sheets, so that user-facing model interactions are correct.
9. As an inference contributor, I want engine and sampling tests, so that local/remote inference behavior remains stable.
10. As a voice contributor, I want voice/TTS/STT loop tests, so that speech interaction remains stable.
11. As a vision contributor, I want camera pairing and multimodal turn tests, so that vision features remain functional.
12. As a storage contributor, I want TinyBase/persistence/import-export tests, so that local session data behavior remains stable.
13. As a search contributor, I want search provider and state tests, so that search integrations remain functional.
14. As an onboarding contributor, I want onboarding flow tests, so that new-user model setup remains functional.
15. As a settings contributor, I want settings sheet and inference settings tests, so that configuration behavior remains stable.
16. As a contributor, I want component tests to run in Jest without route discovery conflicts, so that `app/` route files remain clean.
17. As a contributor, I want TypeScript checks to include Jest tests, so that test code remains strictly typed.
18. As a contributor, I want the old static node test architecture removed, so that there is one canonical testing approach.
19. As a contributor discovering a missing feature during porting, I want the missing feature implemented, so that LiAI reaches behavior parity rather than weakening tests.
20. As a maintainer, I want a green core test slice, so that the migration supports feature work moving forward.
21. As a maintainer, I want follow-up tracking for any not-yet-green ported tests, so that the migration stays transparent.

## Implementation Decisions

- The migration will be a full cutover from the Node `--test` architecture to Jest; the old static source-guard tests are retired rather than retained as a second parallel suite.
- Jest will be used with `jest-expo` in single-platform mode (default iOS), preserving PocketPal's multi-platform-aware, single-project approach without multiplying universal snapshots.
- One root Jest config will govern all colocated tests rather than per-module configs, keeping setup and mock behavior consistent.
- Test files will be colocated in `__tests__` directories under non-route source directories (`components`, `store`, `lib`, `hooks`, `modules`). Screen and route behavior tests will live outside `app/` to avoid Expo Router treating recognized test file extensions as routes.
- Route behavior will be tested with Expo Router's in-memory `renderRouter` approach rather than auto-discovering files from `app/`.
- Native SDK and platform dependencies will be mocked at module boundaries. This includes vision camera, local inference, speech recognition/synthesis, file system, native download, keyboard, gesture, markdown/code highlighting, Reanimated, and related native utilities.
- Reanimated and Expo modules that ship their own Jest mock support will use those provided mocks where available.
- Uniwind CSS files will be stubbed for Jest; component tests will not assert Uniwind's runtime class resolution unless explicitly mocking Uniwind.
- Zustand stores will be mocked at the module level for UI tests, with state and actions controlled from tests, while lower-level store functions will be tested directly.
- Expo Router hooks and navigation will be mocked/injected through test providers for component tests; route integration will be validated separately.
- TypeScript strict mode will apply to test files, and typecheck coverage will remain part of CI commands.
- Colocated tests will use standard Jest plus React Testing Library patterns rather than broad fragile snapshots, while preserving PocketPal-style testing structure.
- No coverage threshold will be enforced during initial migration, because the current baseline is unknown and blocking would slow porting.
- PocketPal tests will be adapted to LiAI's feature set and architecture rather than copied mechanically. Tests for PocketPal-only capabilities (for example WatermelonDB, Firebase, in-app purchases, authentication providers, billing, etc.) are out of scope for LiAI.
- When a ported test exposes a missing LiAI feature, the smallest useful implementation of that feature will be added so the test can pass.
- The project will prioritize critical feature slices first: chat, model management, inference, storage, voice, vision/search-provider integrations, settings, and onboarding.
- Existing dependency policy is respected: standard, approved Jest/Expo testing dependencies will be used, rather than introducing unrelated major libraries.

## Testing Decisions

- A good test verifies externally observable behavior rather than implementation details, includes meaningful edge cases, and fails when real behavior changes.
- Tests should prefer public module/store/component behavior over internal branches. Where useful, high-value invariants may be tested by directly running store and utility functions with fakes.
- LiAI chat stores are already designed with injected dependencies (`getStore`, run turn), which is the preferred existing seam and should be used for behavior tests.
- UI tests should render components with controlled mock stores and router state, then assert behavior rather than internal state.
- Native behavior should not run in Jest; all native SDK interactions must be mocked.
- Prior art for style includes PocketPal's colocated `__tests__` organization, mocked-store component tests, and feature-level test grouping.
- Existing LiAI test fakes and storage builders should be retained as fixtures where they remain compatible with Jest.
- Generated UI should use PocketPal-style snapshots with care to avoid excessive churn from Uniwind.
- Tests for hooks should test hook output and effects through React Testing Library's hook testing utilities.

## Out of Scope

- PocketPal-only infrastructure and products: WatermelonDB, Firebase, auth providers, in-app purchases, billing, premium, and deep settings unrelated to LiAI's app.
- Running real native modules or devices in Jest.
- Universal multi-platform test pass before the single-platform core architecture passes.
- Enforcing strict coverage thresholds during initial migration.
- Rewriting unrelated production code except where explicitly needed to implement missing feature gaps discovered by tests.
- Maintaining both old and new test architectures long-term.

## Further Notes

- Expo Router route discovery means test files must not live anywhere under `app/`; even recognized extensions under `app/` are treated as routes.
- `jest-expo/universal` can be considered later after single-platform stability.
- `check-route-filenames.mjs` should remain in the test entrypoint after migration.
- The initial platform default is iOS-compatible behavior; Android-specific platform branches still need future attention.
- Anything not green at the end of the initial migration should be recorded as follow-up tickets rather than silently skipped.