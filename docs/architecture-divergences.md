# Architecture: what we mirror from `pocketpal-ai/`, and what we don't

`pocketpal-ai/` is the vendored reference app. Its layout, test harness and
conventions are the standard this codebase is measured against — but it is a
different app with different dependencies, so several of its structures are
**deliberately not copied**. This file records each divergence and why, so
nobody "fixes" one later by accident.

Mirrored: the `jest/` harness layout (`setup.ts` + `setupFilesAfterEnv.ts` +
`fixtures/`, no separate `tests/` folder), tests colocated in `__tests__/`
folders named in their subject's casing (except the route-level suites — see
the row below), one concern per test file, native modules mocked at module
boundaries, coverage collected with the same file classes excluded, and the
`services/` + `utils/` split of what used to be `lib/`.

Not mirrored:

| Divergence | Why |
| --- | --- |
| **No `styles.ts` per component.** Styling is Uniwind `className` plus BEM blocks in `global.css`; `StyleSheet.create` is banned by `AGENTS.md`. | PocketPal's convention would contradict a rule we wrote on purpose. Its ~148 `styles.ts` files have no equivalent here. |
| **No global store mocking.** PocketPal's `jest/setup.ts` swaps all 13 MobX singletons for `__mocks__/stores/*` because it constructs them at import time. | Our Zustand stores are factories with injected seams (`getStore`, `runTurn`, `getEngineSource`), so suites drive the real store. Mock only in UI suites that need it. |
| **No lint toolchain.** No ESLint, no Prettier, no commitlint, no husky. | `AGENTS.md` said "fix lint and type errors", which sent a reader looking for a linter that does not exist; it now says type errors (`npm run typecheck` + `npm test`) and names what actually holds style: `jest/architecture-conventions.test.ts` and `jest/design-system.test.ts`, plus the prose. Prettier would collide with the Uniwind `className` conventions on day one. Revisit as its own ticket. |
| **Route-level suites live in `jest/`, not beside the route they exercise.** | Not a preference. Expo Router turns every recognised extension under `app/` into a route — `expo-router/_ctx-shared.js` excludes only `+api`/`+html`/`+middleware`, and `getRoutesCore`'s `ignoreList` has no `__tests__` entry — so a test file there would be a navigable screen with no default component to render. The contract is `.agents/skills/expo-router/references/route-structure.md:10`. `jest/architecture-conventions.test.ts` asserts `app/` holds no test file and no `__tests__` folder, so this cannot be "tidied" back later. |
| **No e2e.** PocketPal has a WebdriverIO + Appium package with 28 specs, 10 page objects and AWS Device Farm configs. | It needs devices, credentials and per-platform CI, and there is nothing to assert on until the coverage tickets land. |
| **No i18n.** PocketPal ships `src/locales/` with 22 locales. | Single-language app. Not a structural gap. |
| **No `components/ui/` design-system layer.** | Tokens live in `themes/tokens.ts` and `global.css`; the shared primitives are the flat files in `components/`. |
| **No `screens/` layer.** | `AGENTS.md` says `app/` is for routes only, and screen bodies sit in `components/<feature>/`. |
| **No folder-per-component.** | Ceremony at 71 files; it pays off at PocketPal's ~600. |
| **Barrels only where they compose.** | PocketPal has 189 `index.ts` re-export shims. Ours are two real composition roots. |
| **State: Zustand, not MobX.** Stores are `store/voice.ts` etc., not `XStore.ts` classes. | Different library, chosen at the start. |
| **Persistence: TinyBase + expo-sqlite, not WatermelonDB.** | Different library. |
| **No coverage *threshold* yet.** Collection is on and reports ~30% statements; the gate waits for a real baseline. | `.scratch/jest-test-migration/spec.md` made this call; the coverage tickets (09–17) are what move the number. The figure moved from ~20% once 14 suites stopped failing to load — see the `react-test-renderer` row below. |
| **kebab-case filenames in `components/`.** | `create-expo-app` convention. Tests are named in their SUBJECT's own casing, which is not always kebab: `services/tts/voiceUi.ts` → `voiceUi.test.ts`, `utils/model-settings.ts` → `model-settings.test.ts`. The reference's PascalCase tests match ITS PascalCase sources; ours match ours. New suites adopt its aspect-dot split (`voiceUi.install.test.ts`) when one subject needs several files. |
| **No `react-test-renderer` in `devDependencies`.** PocketPal declares `react-test-renderer`: `19.2.3`; we declare nothing and let `jest-expo` provide it. | `jest-expo@57` already pins `react-test-renderer`: `19.2.3` as a *regular* dependency — the version `react` is on, and the one Expo SDK 57 bundles. Declaring our own `^19.3.1` hoisted 19.3.1 over jest-expo's copy, and `@testing-library/react-native@13` asserts an **exact** match against `React.version`, so it threw at import and 14 suites never loaded. Removing the devDependency lets jest-expo's 19.2.3 hoist. **Do not re-add it, and do not run `npx expo install react-test-renderer`** — that installs `latest`, which is the break. `@types/react-test-renderer` stays: ReactTestInstance and friends are what `@testing-library/react-native`'s own `.d.ts` files import. |

## Known rough edges

- **Path-string test references.** Four suites assert on source *text* via
  `jest/source.ts` rather than importing (`services/inference/__tests__/vision-gate.test.ts`
  reads `components/chat/message-input.tsx` from inside `services/`). A move
  or a rename breaks a test in another directory, and TypeScript cannot catch
  it. Tracked for retirement under `.scratch/jest-test-migration/issues/10`.

**Resolved 2026-11-01.** `DESIGN.md` and `PRODUCT.md` used to cite
`tests/color-contrast.test.ts` — a file that never existed — while `PRODUCT.md`
described the suite as running under `node --test`, the pre-Jest runner. Both
now name `jest/design-system.test.ts` and `npm test`, and the guard those
documents described is implemented there: contrast arithmetic against the real
token values (including alpha tints, composited), the `global.css` ↔
`themes/tokens.ts` mirror, and the No-Alpha-Text scan. Six live failures were
found and fixed on the way in — see
`.scratch/agents-md-conformance/issues/02-implement-contrast-guard.md`.

**Still stale, deliberately:** the `node --test` references inside
`docs/research/` and `docs/specs/` are dated records of what the harness was
when the research was done (and, in `pocketpal-native-download-audit.md`, of
what the *reference* app uses). They are primary sources, so they are not
rewritten — only the live documents were.