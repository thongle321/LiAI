Status: done
Type: task
Blocked by: 05

# Ticket 06 — Port component and UI behavior tests

Port and adapt applicable PocketPal component tests for LiAI components, including
chat thread/message rendering, model cards and sheets, vision overlays, voice UI,
settings sheets, onboarding components, and search components. Ensure tests run
without being treated as Expo Router routes.

## Acceptance

- [ ] Component tests are colocated outside `app/`.
- [ ] Mock stores and router providers are used consistently.
- [ ] Snapshot churn caused by Uniwind is controlled.
- [ ] Missing component behavior is implemented as needed to pass tests.
- [ ] No test files are placed under `app/`.

## Context pointers

- Spec: `.scratch/jest-test-migration/spec.md`
- LiAI components and their tests as reference only.
- Expo Router testing guidance from research notes in session context.
