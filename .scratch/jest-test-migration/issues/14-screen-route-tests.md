Status: ready-for-agent
Type: task
Blocked by: 08

# Ticket 14 — Screen and route behavior tests

`tests/route-smoke.test.tsx` proves the harness works — an inline route
tree renders, a `Link` press navigates, and a component's `useRouter()` is
the shared mock — but no real screen is exercised. The old Node suite could
not render a screen at all, so this is a coverage class the project has
never had, not a regression.

Targets, in order of value:

1. `app/(drawer)/models.tsx` — the download summary row and the
   auto-navigate-to-chat handoff after the first model becomes active
   (`router.push("/chat")`).
2. `app/(drawer)/(tabs)/chat.tsx` — composer send wiring, the "go to models"
   affordance when no model is active.
3. `app/(drawer)/(tabs)/_layout.tsx` — tab switch navigation.
4. `app/(drawer)/_layout.tsx`, `app/_layout.tsx` — drawer open, the single
   `Host` seeding for `@expo/ui`.
5. `app/onboarding/*` — see ticket 12.
6. Error and loading boundaries: `error-boundaries`, `load-guard`, `splash`.

Constraint that shapes every one of these: test files may not live under
`app/`. Render the screen component directly, or drive the flow with
`renderRouter` and an inline tree that imports the real component — the
latter also exercises route params.

## Acceptance

- [ ] At least chat, models and one drawer-level screen have behavior tests.
- [ ] Tests assert behavior (what the store shows, what navigation fires),
      not that the module imported.
- [ ] Route filename guard keeps passing and no test file lands under `app/`.

## Context pointers

- Harness: `tests/route-smoke.test.tsx`,
  `tests/expo-router-testing-library.d.ts`
- Router seam: `jest/router-mock.ts`
- Retired guards: `git show HEAD~1:tests/legacy/drawer-nav.test.legacy.ts`,
  `.../error-boundaries.test.legacy.ts`, `.../load-guard.test.legacy.ts`,
  `.../splash.test.legacy.ts`
