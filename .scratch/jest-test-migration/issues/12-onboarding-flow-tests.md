Status: ready-for-agent
Type: task
Blocked by: 08

# Ticket 12 — Onboarding flow behavior tests

There is no onboarding test anywhere: not in the old Node suite, and not in
the Jest suite. The flow is three routes
(`app/onboarding/welcome.tsx` → `app/onboarding/model.tsx` →
`app/onboarding/done.tsx`) over `lib/onboarding.ts`, and every path navigates
with `useRouter()`. That is precisely the seam `jest/router-mock.ts` now
makes assertable, and the seam this ticket exists to exercise.

What must not regress:

- Welcome advances to the model step and nothing else (no skip-to-chat).
- The model step lists downloadable models and disables Continue until one
  is selected.
- `done` calls `router.replace(to)` — a REPLACE, so the finished
  onboarding is not on the back stack. Pressing hardware back from the first
  tab must not land in onboarding again.
- A returning user who already completed onboarding is not routed back in
  (the `lib/onboarding.ts` flag).

Tests must live outside `app/` (Expo Router treats recognized extensions
under `app/` as routes). Two options: render each route component directly
with the router mock, or drive the flow through `renderRouter` with an inline
route tree that imports the real components.

## Acceptance

- [ ] A suite under `tests/` or `app/onboarding/__tests__/`'s sibling
      covering welcome → model → done.
- [ ] Navigation assertions use `routerMock` (replace, not push, at the end).
- [ ] The completed-flag path is covered so a returning user is not
      re-onboarded.
- [ ] No test file is created under `app/`.

## Context pointers

- Production: `app/onboarding/*.tsx`, `lib/onboarding.ts`
- Router seam: `jest/router-mock.ts`, `jest.setup.ts`, `tests/route-smoke.test.tsx`
- Spec: `.scratch/jest-test-migration/spec.md` (user story 14, "As an
  onboarding contributor, I want onboarding flow tests")
