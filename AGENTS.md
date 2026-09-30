You are an expert React Native and Expo engineer helping me build
a production-quality frontend project.
Write clean, simple, maintainable code. Prioritize clarity over
unnecessary abstraction.
Think like a senior mobile developer.
---

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

---

## Tech Stack

- Expo

- React Native

- TypeScript

- Expo Router (typedRoutes on — hrefs are compile-time checked)

- Uniwind

- Zustand

- AsyncStorage

- llama.rn (on-device GGUF inference, approved)

- tinybase (chat session persistence, approved) + expo-sqlite (its persister; native, dev-client rebuild)

- react-native-marked + react-native-code-highlighter (chat markdown + code, approved)

- expo-clipboard (copy message/transcript, approved)

- VisionCamera (preview + snapshots + Worklet Frame Processor at 2fps;
  needs `enableFrameProcessors` and a dev-client binary — not Expo Go)

- lucide-react-native (+ react-native-svg peer, approved)

- expo-speech-recognition (voice input, approved)
- expo-speech (voice output, approved)

- expo-font + @expo-google-fonts/inter (Inter type scale, loaded in app/_layout.tsx)

- react-native-reanimated (+ worklets peer, motion, approved)
- react-native-worklets-core (frame-processor JS bridge for vision-camera 4.x, approved)

- expo-file-system (+ legacy API, model files/downloads/uploads, approved)
- expo-document-picker (local model import, approved)
- expo-secure-store (user-provided secret keys, approved)
- expo-image-picker (in-chat camera/gallery attach, approved Wave 4 — needs dev-client rebuild)
- expo-device (RAM-based model tier recommendation in onboarding, approved Wave 5)
- link-preview-js via the `link-preview-js/mobile` entrypoint (uncredentialed public previews, the one ADR-004 exception, approved)

- expo-linking + expo-constants (settings deep-link, app metadata)
- react-native-gesture-handler (navigator drawer gestures, approved; drawer-layout itself stays transitive inside expo-router per the Expo drawer guide)

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
---

## Architecture

Use this folder structure:

```
 
app/  (routes + _layout.tsx; (drawer)/ owns the navigator drawer,
  chat/voice/vision live in (drawer)/(tabs)/)

 (drawer)/  (Drawer layout; drawerContent reuses AppDrawer UI)

 (drawer)/(tabs)/  (bottom tabs: chat + voice + vision, bar in (tabs)/_layout.tsx)

components/  (chat/, models/, onboarding/ + shared rows, nav, sheets)

constants/

hooks/

lib/  (agent/, chat/, inference/, models/ + storage.ts, secrets.ts, motion.ts)

store/  (chat/, models/, inference.ts, voice.ts, search.ts, modelsUi.ts)

themes/

types/

assets/

models/  (app splash config)

tests/

```

**app/** is for routes and screens only. Screens compose components and
call hooks or stores. They should not contain large reusable UI blocks
or business logic.
**components/** is for reusable UI. Create a component when it is
reused in multiple places, when it makes a screen easier to read, or
when it represents a clear UI concept. Examples for this app: model
cards and sheets (components/models/), chat message list and input
(components/chat/), settings rows, nav, sheets. Do not create
components too early.
**assets/device-tiers.json** holds bundled content (RAM-tier model
recommendations). Keep it typed (see `lib/models/device-tiers.ts`).
**store/** holds Zustand stores (store/models/ for catalog, downloads,
settings, remote, active; store/chat/ for sessions, turns). Examples of
state to keep here: activeModelId, download jobs/progress, chat
sessions/drafts, inference params, voice state. Device selection
(lib/inference/deviceSelection.ts) queries accelerators live instead
of persisting them.
**lib/** holds external service helpers (inference/, models/,
chat/, tinybase.ts, secrets.ts).
Never expose secret keys here.
---

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
Reuse class patterns through utilities in global.css, following BEM naming
(`.block` + `.block--modifier`, e.g. `.btn` + `.btn--primary`).

When building from an attached design image:

- match spacing closely
- match typography hierarchy
- match border radius and shadows
- match layout structure
- use consistent reusable styles
- make the UI responsive for different screen sizes

Use Lucide icons (`lucide-react-native`) instead of emoji or text glyphs.
Match the replaced glyph's size and color (colors from `themes/tokens.ts`).

### Style Exception List

Style with Uniwind `className` by default. Use inline styles (never
`StyleSheet.create` — it is banned outright) only for:

- Runtime-computed values that no static class can carry: safe-area insets,
  Reanimated/animated values, `Dimensions`-measured anchor positions, and
  percentage widths derived from a prop (e.g. download progress).

- Platform primitives that take no `className`: `SafeAreaView`,
  `KeyboardAvoidingView` (behavior props), `Modal` (visible/transparent).

- `@expo/ui` native components — `Host`, `Switch`, `Picker`, `Slider`,
  `BottomSheet`. These are real SwiftUI/Compose views; they take
  `UniversalStyle` (padding/background/border/width/height/opacity), not
  `className`. Uniwind styles the screen around them.

- Third-party native components with no `className`: vision-camera
  `Camera`, `react-native-code-highlighter` `CodeHighlighter` — verify on
  device before swapping.

- The runtime-anchored models FAB (`FABGroup`), whose `right`/`bottom` are
  inline because className offsets have failed to resolve on device.

- Navigator props with no `className` equivalent (e.g. Stack
  `screenOptions` `contentStyle`).

- Pressable pressed states, platform-specific styles, shadows.

ScrollView/FlatList content: use Uniwind `contentContainerClassName`
(supported by the installed Uniwind), not `contentContainerStyle`.

Two Uniwind rules this project depends on: never build a className
dynamically (`bg-${x}` will not compile — use whole string literals or a
ternary), and when a BEM class (`.btn`, `.row`, `.seg`) overlaps a
Tailwind utility, wrap with `cn()` so the two do not both apply.
Everywhere else, use Uniwind.

---

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
---

## State Management

- Zustand for global client state.

- Local state for temporary UI state.

- AsyncStorage for prefs and UI state.

- SecureStore for user-provided secret keys. Never AsyncStorage.

---

## TypeScript

- Strict mode.

- No `any`.

- Keep types simple and readable.

---

## Feature Implementation

When building a feature:

1. Read this file first.

2. Identify the files to change.

3. Keep changes focused.

4. Do not rewrite unrelated code.

5. Follow existing patterns.

6. Make sure the feature works end to end.

7. Run `npm run typecheck` and `npm test` before finishing.

---

## Secrets

- Never expose secret keys in client code.

- Store user-provided keys (HF token, provider keys) in SecureStore.

- Use server routes for tokens, AI calls, and any external API access.

---

## Communication

Be concise. Explain what changed and how to test it.
---

## Final Reminder

Before every feature:

- Read this file.

- Follow it strictly.

- Build clean, simple code.

- Replicate UI exactly when designs are provided.
