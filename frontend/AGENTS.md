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
- Communication with the backend
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

- VisionCamera (preview + snapshots + Worklet Frame Processor at 2fps;
  needs `enableFrameProcessors` and a dev-client binary — not Expo Go)

- lucide-react-native (+ react-native-svg peer, approved)

- expo-speech-recognition (voice input, approved)
- expo-speech (voice output, approved)

- expo-font + @expo-google-fonts/raleway (Raleway type scale, approved)

- react-native-reanimated (+ worklets peer, motion, approved)
- react-native-worklets-core (frame-processor JS bridge for vision-camera 4.x, approved)

- expo-file-system (+ legacy API, model files/downloads/uploads, approved)
- expo-document-picker (local model import, approved)
- expo-secure-store (user-provided secret keys, approved)

- expo-linking + expo-constants (settings deep-link, app metadata)
- react-native-gesture-handler (navigator drawer gestures, approved; drawer-layout itself stays transitive inside expo-router per the Expo drawer guide)
- tailwindcss (+ @tailwindcss/postcss, Uniwind build peers)

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
  chat/voice live in (drawer)/(tabs)/)

 (drawer)/  (Drawer layout; drawerContent reuses AppDrawer UI)

 (drawer)/(tabs)/  (bottom tabs: chat + voice, bar in (tabs)/_layout.tsx)

components/

constants/

hooks/

lib/

store/

themes/

types/

assets/

tests/

```

**app/** is for routes and screens only. Screens compose components and
call hooks or stores. They should not contain large reusable UI blocks
or business logic.
**components/** is for reusable UI. Create a component when it is
reused in multiple places, when it makes a screen easier to read, or
when it represents a clear UI concept. Examples for this app:
Bubble, BottomNav, InteractionPanel. Do not create components too early.
**store/** holds Zustand stores. Examples of state to keep here:
chat messages, session id, connection, sending flag. Persist prefs and
UI state with AsyncStorage; persist user-provided secret keys
(HF token, provider keys) with SecureStore only, never AsyncStorage.
**lib/** holds pure tested helpers (format.ts, load-guard.ts,
model-settings.ts), external service clients (api.ts,
download-service.ts, upload-service.ts, models/),
and device I/O adapters (snapshot.ts, voiceSpeak.ts, motion.ts).
A cohesive group may live in a `lib/<name>/` subfolder.
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

Use StyleSheet or inline styles for:

- SafeAreaView (className not supported)

- KeyboardAvoidingView (behavior props)

- Modal (visible, transparent props)

- Animated.View (animated style values)

- Dynamic styles calculated at runtime

- Platform specific styles

- Pressable or TouchableOpacity pressed states

- Shadows (different per platform)

- Navigator props with no className equivalent (e.g. Stack
  screenOptions contentStyle)

- Third-party native components that do not accept className
  (e.g. vision-camera Camera) — verify on device before swapping

- ScrollView/FlatList content: use Uniwind `contentContainerClassName`
  (supported by the installed Uniwind), not `contentContainerStyle`
  Everywhere else, use Uniwind.

---

## Image Rule

Use centralized image imports.

1. Check if constants/images.ts exists.

2. If not, create it.

3. Import all app images there.

4. Use them through the centralized object.

```ts
import mascot from "@/assets/images/mascot.png";
export const images = {
    mascot,
};
```

```tsx
<Image source={images.mascot} />
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
