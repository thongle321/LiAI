Status: ready-for-agent
Type: task
Blocked by: 01,02,03,04,05,06,07

# Ticket 08 — Resolve remaining feature gaps, replace static guards, and clean migration

Complete migration closure: resolve all failing tests or record follow-ups,
implement any missing feature gaps discovered but not already handled,
selectively replace high-value static source guards with behavior tests,
remove legacy temporary node-test dependencies, and verify the full migration.

## Acceptance

- [ ] Core slices (chat, model management, inference, storage, voice, vision,
      search, settings, onboarding) have green behavior tests.
- [ ] Unresolved tests are either fixed or documented as follow-up tickets.
- [ ] High-value migration invariants previously guarded by static source tests
      are replaced with behavior tests where practical.
- [ ] Legacy migration artifacts are removed after successful validation.
- [ ] `npm run typecheck` passes.
- [ ] `npm test` runs the Jest suite successfully.
- [ ] Spec status can be updated to done once acceptance is met.

## Context pointers

- Spec: `.scratch/jest-test-migration/spec.md`
- All previous tickets and their associated batches of tests.
- Existing static test guards as reference for behavior replacement.
