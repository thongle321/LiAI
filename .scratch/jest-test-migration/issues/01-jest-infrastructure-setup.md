Status: done
Type: task
Blocked by: (none)

# Ticket 01 — Jest infrastructure, setup, and native mocks

Implement the foundational Jest testing architecture described in
`.scratch/jest-test-migration/spec.md`: dependencies, root Jest config,
Uniwind/CSS stub, global setup, and boundary mocks for native SDKs. This is the
root ticket that all other migration tickets depend on.

## Acceptance

- [x] Standard Jest/Expo testing dev dependencies installed and aligned with Expo SDK 57.
- [x] Root `jest.config.js` configured with `jest-expo`, setup hooks, transform ignore rules, and module mappings.
- [x] Global setup file mocks Uniwind runtime stubs, fonts/constants/linking, router hooks, and shared test utilities.
      Fonts, linking, speech, speech-recognition and SQLite are mocked as
      whole modules in `__mocks__/external/` (ticket 01 was only partial
      originally; the mocks landed with the review pass, see ticket 17).
- [x] `styleMock` is present for CSS files.
- [x] Native SDK modules have Jest mocks at module boundaries, including local inference, camera, TrueSheet, speech, file system, SQLite, markdown highlighting, and Reanimated.
- [x] `npm test` runs route filename check followed by Jest.
- [x] `npm run typecheck` still passes after adding test infrastructure.
- [x] No test files are placed under `app/`.
- [x] PocketPal reference remains read-only.

## Note on `@react-native/jest-preset`

The code review flagged this devDependency as unused and removable. It is
neither: `jest-expo` declares it as a **peerDependency** and throws at preset
load when it is absent, and `react-native` declares the same peer. Verified by
removal — `npm install` installs nothing in its place and `npx jest` fails
with the peer-dependency validation error. See ticket 17 for the full record.

## Context pointers

- Spec: `.scratch/jest-test-migration/spec.md`
- Existing route guard: `scripts/check-route-filenames.mjs`
- Expo testing docs and SDK 57 guidance from research notes in session context.
- PocketPal Jest config and setup as reference only.
- Boundary mocks and their smoke test: `__mocks__/external/`,
  `tests/module-boundary-mocks.test.tsx`.
