Status: done
Type: task
Blocked by: 02,03,04

# Ticket 05 — Port hook behavior tests

Port and adapt PocketPal applicable hook tests, including chat input/message actions, theme-related behavior where applicable, model readiness/import/storage disclosure, engine offload, voice loop/offload/watch mode, vision turns, and context ladders. Resolve missing hook behavior surfaced by the tests.

## Acceptance

- [ ] Hook tests are Jest behavior tests using React Testing Library hook utilities.
- [ ] Native and provider dependencies are mocked at boundaries.
- [ ] Missing hook capabilities are implemented as needed.
- [ ] All hook test dependencies on native modules are mocked.

## Context pointers

- Spec: `.scratch/jest-test-migration/spec.md`
- LiAI hooks under the repository hooks directory.
- PocketPal hook tests as reference only.
