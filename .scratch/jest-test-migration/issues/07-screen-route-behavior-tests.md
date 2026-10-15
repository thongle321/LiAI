Status: done
Type: task
Blocked by: 06

# Ticket 07 — Port screen and route behavior tests

Port and adapt applicable screen-level behavior tests using Expo Router's
in-memory route testing approach. Test route behavior without adding test files
to the `app/` route tree.

## Acceptance

- [ ] Screen routes are tested with inline route definitions outside `app/`.
- [ ] Navigation behavior is tested through router test utilities.
- [ ] Native dependencies used by screens remain mocked.
- [ ] Missing screen/route behavior is implemented as needed to pass tests.

## Context pointers

- Spec: `.scratch/jest-test-migration/spec.md`
- Expo Router `renderRouter` documentation and SDK 57 testing guidance from research notes.
- LiAI screens and routes as reference only.
