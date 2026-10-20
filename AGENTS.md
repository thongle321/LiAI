You are an expert React Native and Expo engineer helping me build
a production-quality frontend project.
Write clean, simple, maintainable code. Prioritize clarity over
unnecessary abstraction.
Think like a senior mobile developer.

## Project Context

LiAI is a multimodal AI companion for mobile.

See the root `AGENTS.md` for the complete product overview,
capabilities, and project-wide architecture.

This directory contains only the mobile frontend.

The mobile application is responsible for:

- User interface
- Navigation
- Camera and device interaction
- Voice input/output integration
- Local client state
- Local persistence
- Presenting AI responses and companion interactions

## Tech Stack

- Expo

- React Native

- TypeScript

- Expo Router

- Uniwind

- Zustand

- AsyncStorage

- llama.rn

- tinybase + expo-sqlite

- react-native-marked + react-native-code-highlighter

- expo-clipboard

- VisionCamera

- lucide-react-native + react-native-svg

- expo-speech-recognition
- expo-speech

- expo-font + @expo-google-fonts/inter

- react-native-reanimated
- react-native-worklets-core

- expo-file-system
- expo-document-picker
- expo-secure-store
- expo-image-picker
- expo-device
- link-preview-js

- expo-linking + expo-constants
- react-native-gesture-handler
- react-native-keyboard-controller
- react-native-safe-area-context
- react-native-screens
- react-native-webview
- @lodev09/react-native-true-sheet
- expo-haptics
- expo-keep-awake
- expo-sharing
- expo-splash-screen
- expo-status-bar
- expo-system-ui
- expo-build-properties
- expo-dev-client
- tailwindcss

### Dependency Policy

Do not introduce new major libraries unless there is a strong reason.
Ask before installing anything new.

---

## Development Philosophy

Build feature by feature.
For every feature:

1. Read this file first.

2. Keep the implementation simple.

3. Avoid overengineering.

4. Prefer readable code over clever code.

5. Build the smallest useful version first.

6. Refactor only when repetition appears.

---

## Decision Making

If something is unclear or could be improved, suggest a better
approach. If a new library would significantly help, recommend it,
explain why, and ask before adding it.
Do not install new libraries without approval.


## Architecture

Use this folder structure:

```
 
app/

components/

constants/

hooks/

services/

store/

themes/

types/

utils/

assets/

jest/

modules/

plugins/

docs/


```

**app/** is for routes and screens only. Screens compose components and
call hooks or stores. They should not contain large reusable UI blocks
or business logic.
**components/** is for reusable UI. Do not create
components too early. Screen bodies are NOT shared UI and do not live in
`components/` root: they get their own folder (`components/settings/`,
`components/models/`), beside the private parts only they use. Shared row
and sheet primitives that several features use (`settings-rows.tsx`)
stay flat. Files are kebab-case, platform suffix included
(`picker-menu.ios.tsx`), matching `create-expo-app`.
**assets/device-tiers.json** Keep it typed (see `services/models/device-tiers.ts`).
**store/** holds Zustand stores. A store with injected collaborators
composes its slices behind a barrel (`store/chat/index.ts`,
`store/models/index.ts`); barrels are for composition, not re-export.
**services/** is everything bound to a device API, storage, network, or a
domain engine — `tts/ inference/ agent/ chat/ models/ voice/ vision/ search/
downloads/ auth/ storage/`. Never expose secret keys here.
**utils/** is pure functions only: formatting, parsing, guards, motion,
capability rules. A file that imports `expo-*`, `react-native-*`, SQLite or
TinyBase belongs in `services/`, not here.
**Imports:** anything two or more directories deep imports through the `@/`
alias (`tsconfig.json` maps `@/*` to the repo root; Metro resolves it, and
`jest.config.js` mirrors the mapping). A sibling stays relative — `./x` is
already unambiguous. So `import { useChatStore } from "@/store/chat.ts";`, not
`"../../../store/chat.ts"`. `jest/architecture-conventions.test.ts` enforces
this. Dynamic `import()` calls are the one exception and keep their relative
paths: jest's CJS runtime does not route them through `moduleNameMapper`.
**jest/** is the test harness: `setup.ts` (module boundaries, loaded before
a module is imported), `setupFilesAfterEnv.ts` (per-test hygiene),
`fixtures/` (shared fakes), plus the router/storage/source helpers and the
mocks `jest.config.js` maps. There is no `tests/` folder — tests live in a
`__tests__/` folder beside the code they test, one concern per file, named
in the subject's own casing (`voiceUi.install.test.ts`).
**modules/** holds local Expo native modules (e.g. `native-download`, Kotlin
+ TypeScript). Their Kotlin is unreachable from `npm test` — nothing in this
repo exercises it on a device today, so treat Kotlin changes as unverified
until someone runs the app.
**docs/** holds research, specs and agent docs (see Agent skills below).
**pocketpal-ai/** is the vendored reference app — read it, never edit it.
**plugins/** holds Expo config plugins. Native tweaks live here so `expo prebuild` regenerates them; never hand-edit `android/` or `ios/`.
**android/** is committed (PocketPal's way; `expo prebuild --clean` regenerates it from `app.json` + `plugins/` — restore anything else from git). Its manifest carries the two
`uses-feature` camera lines (generated by `plugins/withCameraUsesFeature.js`) that keep camera-less devices installable; build
output is excluded by `android/.gitignore`.

## UI Rules

For any UI task:

- Replicate the provided design exactly.
- Match layout, spacing, padding, font sizes, font hierarchy, colors,
  border radius, shadows, alignment, and proportions.
- Do not approximate. Do not simplify unless explicitly asked.

---

## Styling Rules

Use Uniwind classes. Do not use StyleSheet unless it is not possible
to style with className.

Use the Uniwind version installed in this project. Check
package.json. Do not upgrade without approval.

Reuse class patterns through utilities in global.css.

When building from an attached design image:

- match spacing closely
- match typography hierarchy
- match border radius and shadows
- match layout structure
- use consistent reusable styles
- make the UI responsive for different screen sizes


### Style Exception List

Use StyleSheet or inline styles for:

- Pressable pressed states, platform-specific styles, shadows.

- SafeAreaView (className not supported)

- KeyboardAvoidingView (behavior props)

- Modal (visible, transparent props)

- Animated.View (animated style values)

- Dynamic styles calculated at runtime

- Platform specific styles

- Pressable or TouchableOpacity pressed states

- Shadows (different per platform)

- Use Expo UI native components when neither built-in Universal components nor community components provide a suitable solution that works on both iOS and Android. 
These components use UniversalStyle instead of className. Prefer universal components whenever possible. 
If a component is platform-specific, keep the iOS and Android implementations in separate .ios.tsx / .android.tsx file and never branch inline. 
Never import a platform-specific component on the wrong platform, as it can crash the app. Compose import mounting on iOS is a crash, not a fallback.
  
- Use Lucide icons (`lucide-react-native`). Match the replaced glyph's size and color (colors from `themes/tokens.ts`).

Everywhere else, use Uniwind.


## Image Rule

Use centralized image imports.

1. Check if constants/images.ts exists.

2. If not, create it.

3. Import all app images there.

4. Use them through the centralized object.

```ts
import icon from "../assets/icon.png";
export const images = {
    icon,
};
```

```tsx
<Image source={images.icon} />
```

Do not import image assets directly inside screens or components.

## State Management

- Zustand for global client state.

- Local state for temporary UI state.

- AsyncStorage for prefs and UI state.

- SecureStore for user-provided secret keys. 

---

## TypeScript

- Strict mode.

- No `any`.

- Keep types simple and readable.


## Feature Implementation

When building a feature:

1. Read this file first.

2. Identify the files to change.

3. Keep changes focused.

4. Do not rewrite unrelated code.

5. Follow existing patterns.

6. Make sure the feature works end to end.

7. Fix lint and type errors before finishing.



## Secrets

- Never expose secret keys in client code.

- Store user-provided keys (ex: HF token, provider keys,...) in SecureStore.

- Use server routes for tokens, AI calls, and any external API access.



## Communication

Be concise. Explain what changed and how to test it.


## Final Reminder

Before every feature:

- Read this file.

- Follow it strictly.

- Build clean, simple code.

- Replicate UI exactly when designs are provided.


## PocketPal parity

`pocketpal-ai/` is the vendored PocketPal AI reference app, and feature
parity work is measured against it. Read its source for the reference
behavior, record verdicts and findings in `docs/research/`, and check
`docs/specs/` before starting parity work.

---

## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, default label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
