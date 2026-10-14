Status: done
Type: task
Blocked by: (none)

# Ticket 01 — Jest infrastructure, setup, and native mocks

Implement the foundational Jest testing architecture described in
`.scratch/jest-test-migration/spec.md`: dependencies, root Jest config,
Uniwind/CSS stub, global setup, and boundary mocks for native SDKs. This is the
root ticket that all other migration tickets depend on.

## Acceptance

- [ ] Standard Jest/Expo testing dev dependencies installed and aligned with Expo SDK 57.
- [ ] Root `jest.config.js` configured with `jest-expo`, setup hooks, transform ignore rules, and module mappings.
- [ ] Global setup file mocks Uniwind runtime stubs, fonts/constants/linking, router hooks, and shared test utilities.
- [ ] `styleMock` is present for CSS files.
- [ ] Native SDK modules have Jest mocks at module boundaries, including local inference, camera, TrueSheet, speech, file system, SQLite, markdown highlighting, and Reanimated.
- [ ] `npm test` runs route filename check followed by Jest.
- [ ] `npm run typecheck` still passes after adding test infrastructure.
- [ ] No test files are placed under `app/`.
- [ ] PocketPal reference remains read-only.

## Context pointers

- Spec: `.scratch/jest-test-migration/spec.md`
- Existing route guard: `scripts/check-route-filenames.mjs`
- Expo testing docs and SDK 57 guidance from research notes in session context.
- PocketPal Jest config and setup as reference only.
