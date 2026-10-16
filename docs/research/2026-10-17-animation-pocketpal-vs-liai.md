# Research: animation strategy in PocketPal vs LiAI

Date: 2026-10-17 · Status: findings + recommendations, no code changed (yet)
Method: both source trees read directly (LiAI at `D:\aivision`, PocketPal vendored
at `D:\aivision\pocketpal-ai` v1.18.0) + `package.json` versions. Every claim
cites a path or a resolved dependency version. No blog/summary sources.

---

## 1. Question

1. How does PocketPal implement motion — is it a single coherent, "practical"
   approach, and where it is manual, why?
2. How does that compare to LiAI, and what should LiAI refactor as a result?
3. Which features exist only in LiAI (so they should not be treated as parity
   bugs against PocketPal)?

Companion docs already in this repo:
- `docs/specs/2026-09-28-tab-switch-animation-jank.md` (drawer→tab jank root cause)
- `docs/research/2026-09-29-pocketpal-chat-feature-audit.md`

---

## 2. PocketPal — animation inventory

### 2.1 Dependencies

From `pocketpal-ai/package.json`:

- `react-native-reanimated@^4.1.3`
- `react-native-gesture-handler@^2.28.0`
- `react-native-worklets@^0.6.0`
- `react-native-keyboard-controller@1.19.6`
- `react-native@0.82.1`, `react@19.1.1`
- No `moti`, `lottie`, or `react-native-animatable` anywhere.

Reanimated is therefore available (and used), but — as the inventory below shows —
only in a few, very specific places.

### 2.2 Reanimated — used only for UI-thread-critical work

Production files importing from `react-native-reanimated`: **5**.

| File | What it animates | Primitives |
|---|---|---|
| `src/components/ChatView/ChatView.tsx` | keyboard occlusion, scroll-to-bottom button, header | `useSharedValue`, `useDerivedValue`, `useAnimatedStyle`, `withTiming`, `useAnimatedScrollHandler`, `useAnimatedStyle`, plus `useReanimatedKeyboardAnimation` from `react-native-keyboard-controller`, `InteractionManager.runAfterInteractions` |
| `src/components/Sheet/Actions.tsx` | sheet padding w.r.t. keyboard | `useSharedValue`, `useAnimatedReaction`, `useAnimatedStyle`, `withSpring`/`withTiming` |
| `src/components/Sheet/actionsPadding.ts` | `'worklet'` helpers returning timing/spring configs | `Easing`, `WithSpringConfig`, `WithTimingConfig` |
| `src/components/Sheet/keyboardTarget.ts` | update sheet keyboard target on UI thread | `runOnUI` |
| `src/components/ui/Stepper/Stepper.tsx` | dot width/background on step change | `useSharedValue`, `useAnimatedStyle`, `withTiming`, `interpolateColor` |

**Notable absence:** PocketPal does **not** use Reanimated entering/exiting props
(`FadeIn`, `SlideIn`, `entering=`, `exiting=`) at all — grep over `src/` returns
zero matches.

### 2.3 RN core `Animated` — the manual layer

Production files importing `Animated` from `react-native`: **13**. These are all
small, self-contained effects:

- `src/components/Bubble/Bubble.tsx` — press scale (`Animated.Value` + `Animated.spring`)
- `src/components/CircularActivityIndicator/CircularActivityIndicator.tsx` — 360° rotation loop
- `src/components/LoadingBubble/LoadingBubble.tsx` — pulsing opacity on three dots (`Animated.loop`/`timing`)
- `src/components/PendingIndicator/PendingIndicator.tsx` — pulsing opacity loop
- `src/components/Menu/MenuItem/MenuItem.tsx` — fade-out on press
- `src/components/Message/Message.tsx` — spring scale feedback
- `src/components/VoiceChip/VoiceChip.tsx` — progress pill expand/collapse (`Animated.timing`)
- `src/components/ResponseBubble/ResponseBubble.tsx` — chevron rotation (`Animated.timing`) + `LayoutAnimation`
- `src/components/ThinkingBubble/ThinkingBubble.tsx` — chevron rotation + scale sequencing + `LayoutAnimation`
- `src/components/ChatInput/ChatInput.tsx` — edit-bar height spring + icon rotation spring
- `src/components/KeyboardAccessoryView/index.tsx` and `hooks/usePanResponder.tsx` — keyboard offset via `Animated.subtract`, pan-driven `positionY` via `Animated.event`
- `src/screens/PalsScreen/components/ExpandableSearch/ExpandableSearch.tsx` — expand/collapse height timing

### 2.4 `LayoutAnimation` — structural transitions

Production files using `LayoutAnimation`: **6** (plus 3 test files and `useKeyboardDimensions`).

- `src/components/ResponseBubble/ResponseBubble.tsx:51-58` — `configureNext({ easeInEaseOut opacity, spring scaleXY })`
- `src/components/ThinkingBubble/ThinkingBubble.tsx:97-135` — spring opacity/collapse
- `src/screens/ModelsScreen/ModelCard/ModelCard.tsx:330-340` — expanded state transition
- `src/components/TTSSetupSheet/VoicePickerView.tsx:218-222` — list expand
- `src/components/ChatView/ChatView.tsx:113` — list updates
- `src/components/KeyboardAccessoryView/hooks/useKeyboardDimensions.tsx:58-62` — keyboard height changes

Every one of them is bracketed by `UIManager.setLayoutAnimationEnabledExperimental(true)`
(Android-only legacy flag) — e.g. `ResponseBubble.tsx:20`, `ThinkingBubble.tsx:26`,
`ModelCard.tsx:78`.

### 2.5 Why the manual way?

PocketPal's split is not an accident — it is a **scope-based routing**:

1. **Reanimated only where the JS thread would lose.** Keyboard occlusion, scroll
   handlers, gesture-driven pan position and sheet padding are high-frequency and
   interrupt-latency-sensitive; those run on the UI thread via worklets. Looping
   opacity/rotation on a single view does not need that.
2. **RN `Animated` is built into core.** No extra bundle, no Babel plugin, no
   worklet compile. For a one-shot press scale or a pulsing dot, the built-in
   API is the cheaper write *and* the cheaper read.
3. **`LayoutAnimation` delegates structural changes to the native layout engine**
   instead of per-component animated values — a single `configureNext` call covers
   an arbitrary subtree expand/collapse. That is dramatically less code than a
   Reanimated `Layout` transition on every affected child.
4. **Historical consistency.** PocketPal (1.18.x) was built on the older RN
   Animated baseline; Reanimated arrived later for the keyboard/scroll pieces and
   was not retro-fitted onto trivial effects.

**Practicality verdict:** pragmatic but **fragmented**. It is genuinely efficient
for the simple cases, but it also means (a) two animation models in one codebase,
(b) reliance on an Android experimental flag that is a no-op on some New-Arch
paths, and (c) `Animated.loop` only runs smoothly if each call site remembers
`useNativeDriver`. It is a working compromise, not a reference architecture.

---

## 3. LiAI — animation inventory

### 3.1 Dependencies

From `package.json`: `react-native-reanimated@4.5.1`, worklets 0.10.1, gesture
handler 2.32.0, keyboard controller 1.21.9, Reanimated-only.

### 3.2 RN Animated / LayoutAnimation / InteractionManager

Grep over the main app (`app/`, `components/`, `hooks/`, `utils/`, `store/`) for
`Animated` from `react-native`, `LayoutAnimation`, `InteractionManager`:
**zero matches.** LiAI is exclusively on Reanimated.

### 3.3 `utils/motion.ts` — the single motion language

File: `D:\aivision\utils\motion.ts`. Central preset module, explicitly the
only `utils/` file allowed to import native modules (see
`jest/architecture-conventions.test.ts`).

Constants:
- `MOTION_DURATION_MS = 200`, `motionEasing = Easing.out(Easing.quad)`
- `MENU_DURATION_MS = 250`, `menuEasing = Easing.bezier(0.4, 0, 0.2, 1)` (Material standard, copied from react-native-paper 5.14.5, which PocketPal pins)
- `ACTION_DURATION_MS = 150`, `ACTION_STAGGER_MS = 15`

Builders (all Reanimated `BaseAnimationBuilder`, declarative enter/exit):
- `menuEnteringFade`, `menuEnteringZoom`, `menuExiting`
- `fabActionEntering`, `fabActionExiting`
- `bubbleEntering` (`FadeInDown`), `fadeEntering`/`fadeExiting`

Hook: `usePressFeedback()` — UI-thread scale `1 → 0.97` press-in, timed back.

Explicit invariant in the file comment:

> there is deliberately no per-screen focus fade… a 200 ms opacity animation
> wrapped around the whole tab subtree (message list, camera preview), which
> forces full-screen offscreen compositing and janks the switch on Android.
> Tab switches are instant.

This is the lesson already absorbed from the tab-jank audit; PocketPal also has
no content fade and no entering motion on navigation.

### 3.4 Where LiAI animates

Reanimated imports occur in 18 main-app files:

- `app/(drawer)/(tabs)/chat.tsx` — `useSharedValue`/`withTiming` for search-bar/extra-padding scroll behaviour
- `app/(drawer)/(tabs)/voice.tsx` — overlay opacity fade in/out (`useAnimatedStyle`, `useSharedValue`, `withTiming`)
- `components/chat/message-list-item.tsx` — `bubbleEntering`/`fadeExiting` on mount/unmount
- `components/chat/pending-indicator.tsx` — `withDelay`/`withRepeat`/`withTiming` typing dots + enter/exit
- `components/chat/reasoning-block.tsx` — `Animated.createAnimatedComponent(ChevronDown)` rotation via shared value
- `components/chat/chat-warning-snackbar.tsx` — `FadeInDown`/`FadeOutDown`
- `components/chat/markdown-view`-adjacent menus: `chat-menu.tsx`, `models-header-right.tsx`, `fab-group.tsx` — `FadeIn`/`ZoomIn`/`FadeOut` + `Animated.View`
- `components/models/engine-card.tsx` — `layout={Layout.duration(...).easing(...)}`
- `components/voice/engine-card.tsx` (dup pattern), `models/model-card.tsx` — `fadeEntering`/`fadeExiting`
- `components/snackbar-overlay.ios.tsx` — `FadeInDown/Up`, `FadeOutDown/Up`
- `components/vision-overlays.tsx`, `components/chat/message-input.tsx` — combined with `useKeyboardLift`
- `hooks/useKeyboardLift.ts` — `useReanimatedKeyboardAnimation`, `useDerivedValue`, `useAnimatedStyle`, translating `-occlusion`
- `utils/motion.ts` itself
- `components/chat/chat-header.tsx`, `message-list.tsx` (type-only)

Motion is also completely outside CSS: `global.css` has zero `animation`,
`keyframes`, or `transition` rules; all motion is Reanimated.

### 3.5 Keyboard hooks

- `hooks/useKeyboardLift.ts` consumes `useReanimatedKeyboardAnimation` and
  returns `{ transform: [{ translateY: -occlusion }] }`.
- Geometry only in pure `utils/keyboard.ts`; state in `store/keyboard.ts`.
- Consumers: `components/chat/message-input.tsx`, `components/vision-overlays.tsx`.
- `chat.tsx` additionally runs its own shared-value timings for list height.

---

## 4. Side-by-side

| Concern | PocketPal | LiAI | Net |
|---|---|---|---|
| Dependency surface | Reanimated + core Animated + LayoutAnimation | Reanimated only | LiAI simpler dependency story |
| Mental models | Two (UI-thread worklets vs JS-thread core) | One (all UI-thread) | LiAI wins on consistency |
| Thread discipline | Worklets only where needed; loops often JS-thread | Everything UI-thread | LiAI safer under streaming load |
| Mount/unmount on navigation | None (drawer is the only motion) | Instant tabs (already aligned) — but bubbles still enter | LiAI still animates more surfaces |
| Expand/collapse | One `LayoutAnimation.configureNext` call | Reanimated `Layout` + hand-rolled rotations | PocketPal cheaper at call sites |
| Enter/exit declarative props | Zero usage | Heavy (bubbles, menus, FAB, snackbars) | LiAI richer; higher cost during streaming |
| Android legacy flag dependence | Yes (`UIManager.setLayoutAnimationEnabledExperimental`) | No | LiAI more robust on New Arch |
| Keyboard | `useReanimatedKeyboardAnimation` + custom accessory view | `useKeyboardLift` on reanimated keyboard controller | Comparable; accessory view is LiAI's gap only if needed |
| CSS animation | n/a (RN) | None — Reanimated only | Same stance |

---

## 5. Refactor recommendations for LiAI

Order of expected impact / risk, smallest first. **Do not** migrate LiAI onto
PocketPal's mixed model — Reanimated-only is the stronger choice given you
already enforce it centrally and in tests.

1. **Treat `bubbleEntering` as the next audit target (highest perf leverage).**
   Every appended message runs a 200 ms `FadeInDown` on mount. During a streaming
   assistant turn this stacks many concurrent entering animations — same root cause
   class as the removed tab fade. Gate it: animate user turns / the final assistant
   bubble only, or suppress while a turn is `streaming`. PocketPal mounts chat
   bubbles with no enter animation.
   Files: `utils/motion.ts` (`bubbleEntering`), `components/chat/message-list-item.tsx`.

2. **Centralize expand/collapse motion like menus are.** Right now `engine-card.tsx`
   uses `layout={Layout.duration(MOTION_DURATION_MS).easing(motionEasing)}` and
   `reasoning-block.tsx` hand-rolls a rotation shared value. Move the collapse
   config into `motion.ts` (e.g. `collapseLayout()`, `chevronRotation()`) so the
   rest of the codebase has one place to read. Either keep Reanimated `Layout`
   or — if profiling shows jank on Android — borrow PocketPal's one-line
   `LayoutAnimation.configureNext` pattern for expand/collapse only. Do not
   introduce per-component animated values in new code.
   Files: `utils/motion.ts`, `components/chat/reasoning-block.tsx`,
   `components/models/engine-card.tsx`.

3. **Use `InteractionManager.runAfterInteractions` before heavy toggles.**
   PocketPal does this in `ChatView`. Apply to expand/collapse of large markdown
   or code blocks so the interaction completes before layout settles.
   Files: `components/chat/reasoning-block.tsx`, message action sheets.

4. **Keep the "no per-navigation fade" invariant locked.** Already documented in
   `motion.ts` and in `docs/specs/2026-09-28-tab-switch-animation-jank.md`; do
   not regress. Add it to PR review checklist for navigation code.

5. **Keep `useKeyboardLift` + reanimated keyboard controller.** Already on the
   right track. Only consider PocketPal's `KeyboardAccessoryView` if you actually
   need a composer action bar — that is a feature decision, not an animation one.

6. **Do not port PocketPal's mixed API.** Concretely, do not add `Animated` from
   `react-native` or `LayoutAnimation` to new LiAI code without an entry in
   `docs/research/` and `AGENTS.md` update. The existing test
   (`jest/architecture-conventions.test.ts` guarding `utils/motion.ts`) is the
   only place device imports are permitted; extend that convention if a new case
   is genuinely needed.

Non-goal: animation polish for surfaces that differ purely because the feature
does not exist in PocketPal (see §6).

---

## 6. Features that exist only in LiAI

These are real LiAI features with no PocketPal equivalent in the vendored tree;
they must not be judged against PocketPal parity.

| Feature | Evidence (LiAI paths) |
|---|---|
| Voice + Vision bottom tabs inside the chat drawer | `app/(drawer)/(tabs)/voice.tsx`, `app/(drawer)/(tabs)/vision.tsx`, `app/(drawer)/(tabs)/_layout.tsx` |
| Voice capture / STT + voice loop | `hooks/useVoiceLoop.ts`, `hooks/useVoiceOffload.ts`, `services/voice/*` |
| Vision turn + watch mode | `hooks/useVisionTurn.ts`, `hooks/useWatchMode.ts`, `services/vision/vision-watch.ts` |
| Keyboard lift / compensation | `utils/keyboard.ts`, `hooks/useKeyboardLift.ts` |
| Native download module + Android worker | `modules/native-download/*` |
| Device-tier data / runtime | `assets/device-tiers.json`, `services/models/device-tiers.ts` |
| Context-full banner + context ladder | `components/chat/context-full-banner.tsx`, `hooks/useContextLadder.ts`, `services/chat/context-ladder.ts` |
| Image viewer modal | `components/chat/image-viewer.tsx` |
| Fluid text scale | `hooks/useFluidTextScale.ts`, `themes/textScale.ts` |
| Models download FAB group | `components/models/fab-group.tsx` |
| Chat sampling rows | `components/chat/sampler-rows.tsx` |
| Extra chat warning snackbar | `components/chat/chat-warning-snackbar.tsx` |

For scope awareness, the reverse (PocketPal-only) includes Pals/pal hub, talents,
web-search result cards, benchmark + e2e automation bridge, IAP, WatermelonDB-style
database layer, localization, DevTools, attachment/file/image/video messages, and
increase-context sheet. None of those are in scope for an animation refactor.

---

## 7. Suggested next steps

- [x] Decide whether to write this as the canonical note (placed at
      `docs/research/2026-10-17-animation-pocketpal-vs-liai.md`).
- [x] Implement recommendation #1: gate `bubbleEntering` while a turn streams
      (`components/chat/message-list-item.tsx`).
- [x] Implement recommendation #2: centralize expand/collapse layout transition
      via `motionLayout()` (`utils/motion.ts`, `components/voice/engine-card.tsx`).
- [x] Implement recommendation #3: defer reasoning auto-collapse through
      `InteractionManager.runAfterInteractions`
      (`components/chat/reasoning-block.tsx`).
- [x] Run typecheck + tests on the resulting diff (`npm run typecheck`, `npm test`: 30 suites / 355 tests green; commit `e046117`).
- [x] Manual two-axis code review of the diff (standards + spec); no hard violations noted.
- [ ] If expand/collapse changes ship, verify on Android before release,
      mirroring the open-questions in the tab-jank spec.