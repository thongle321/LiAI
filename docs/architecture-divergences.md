# Architecture: what we mirror from `pocketpal-ai/`, and what we don't

`pocketpal-ai/` is the vendored reference app. Its layout, test harness and
conventions are the standard this codebase is measured against — but it is a
different app with different dependencies, so several of its structures are
**deliberately not copied**. This file records each divergence and why, so
nobody "fixes" one later by accident.

Mirrored: the `jest/` harness layout (`setup.ts` + `setupFilesAfterEnv.ts` +
`fixtures/`, no separate `tests/` folder), tests colocated in `__tests__/`
folders named in their subject's casing, one concern per test file, native
modules mocked at module boundaries, coverage collected with the same file
classes excluded, and the `services/` + `utils/` split of what used to be
`lib/`.

Not mirrored:

| Divergence | Why |
| --- | --- |
| **No `styles.ts` per component.** Styling is Uniwind `className` plus BEM blocks in `global.css`; `StyleSheet.create` is banned by `AGENTS.md`. | PocketPal's convention would contradict a rule we wrote on purpose. Its ~148 `styles.ts` files have no equivalent here. |
| **No global store mocking.** PocketPal's `jest/setup.ts` swaps all 13 MobX singletons for `__mocks__/stores/*` because it constructs them at import time. | Our Zustand stores are factories with injected seams (`getStore`, `runTurn`, `getEngineSource`), so suites drive the real store. Mock only in UI suites that need it. |
| **No lint toolchain.** No ESLint, no Prettier, no commitlint, no husky. | Style is enforced by `AGENTS.md` prose. Prettier would collide with the Uniwind `className` conventions on day one. Revisit as its own ticket. |
| **No e2e.** PocketPal has a WebdriverIO + Appium package with 28 specs, 10 page objects and AWS Device Farm configs. | It needs devices, credentials and per-platform CI, and there is nothing to assert on until the coverage tickets land. |
| **No i18n.** PocketPal ships `src/locales/` with 22 locales. | Single-language app. Not a structural gap. |
| **No `components/ui/` design-system layer.** | Tokens live in `themes/tokens.ts` and `global.css`; the shared primitives are the flat files in `components/`. |
| **No `screens/` layer.** | `AGENTS.md` says `app/` is for routes only, and screen bodies sit in `components/<feature>/`. |
| **No folder-per-component.** | Ceremony at 71 files; it pays off at PocketPal's ~600. |
| **Barrels only where they compose.** | PocketPal has 189 `index.ts` re-export shims. Ours are two real composition roots. |
| **State: Zustand, not MobX.** Stores are `store/voice.ts` etc., not `XStore.ts` classes. | Different library, chosen at the start. |
| **Persistence: TinyBase + expo-sqlite, not WatermelonDB.** | Different library. |
| **No coverage *threshold* yet.** Collection is on and reports ~20% statements; the gate waits for a real baseline. | `.scratch/jest-test-migration/spec.md` made this call; the coverage tickets (09–17) are what move the number. |
| **kebab-case filenames in `components/`.** | `create-expo-app` convention. Tests are named in their SUBJECT's own casing, which is not always kebab: `services/tts/voiceUi.ts` → `voiceUi.test.ts`, `utils/model-settings.ts` → `model-settings.test.ts`. The reference's PascalCase tests match ITS PascalCase sources; ours match ours. New suites adopt its aspect-dot split (`voiceUi.install.test.ts`) when one subject needs several files. |

## Known rough edges

- **Path-string test references.** Four suites assert on source *text* via
  `jest/source.ts` rather than importing (`services/inference/__tests__/vision-gate.test.ts`
  reads `components/chat/message-input.tsx` from inside `services/`). A move
  or a rename breaks a test in another directory, and TypeScript cannot catch
  it. Tracked for retirement under `.scratch/jest-test-migration/issues/10`.
- **`DESIGN.md` and `PRODUCT.md` cite `tests/color-contrast.test.ts`**, which
  does not exist in this repo, and `PRODUCT.md` still says the suite runs
  under `node --test`. Both predate the Jest migration and are stale.