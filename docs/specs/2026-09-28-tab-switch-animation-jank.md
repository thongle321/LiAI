# Research: why LiAI's drawer→tab switch janks where PocketPal's is smooth

Date: 2026-09-28 · Status: findings only, no code changed
Method: both source trees read directly (LiAI, and PocketPal vendored at
`pocketpal-ai/` v1.18.0) + installed dependency versions. Every claim cites
`file:line` or a resolved package version. No blog summaries.

## 1. Question

Picking a destination from the hamburger drawer animates smoothly in PocketPal
and janks in LiAI. What is the cause, and what does PocketPal do differently?

## 2. Version frame

| Concern | LiAI | PocketPal |
|---|---|---|
| Drawer engine | `react-native-drawer-layout@4.2.10` via `expo-router@~57.0.22` `Drawer` | `react-native-drawer-layout@4.2.1` via `@react-navigation/drawer@7.7.10` (`pocketpal-ai/package.json`, `yarn.lock:react-native-drawer-layout`) |
| Reanimated | `react-native-reanimated@4.5.1` + `react-native-worklets@0.10.1` | `react-native-reanimated@^4.1.3` |
| Gesture handler | `react-native-gesture-handler@~2.32.0` | `^2.28.0` |
| Screens | `react-native-screens@~4.26.0` | `^4.19.0` |
| Root view | `GestureHandlerRootView` present — `app/_layout.tsx:38` | `GestureHandlerRootView` present — `pocketpal-ai/App.tsx:105` |

**The drawer engine is the same major/minor.** So the jank is not a
library-version gap; it is in the app code above it.

## 3. How each app wires drawer → destination

**PocketPal — one navigator, one navigation per press.**
`Drawer.Navigator` is created at `pocketpal-ai/App.tsx:56` and every
destination is a `Drawer.Screen` of it (CHAT, PALS, MODELS, BENCHMARK,
SETTINGS, APP_INFO — `App.tsx:120-206`). A menu press calls
`props.navigation.navigate(ROUTES.CHAT)` and nothing else
(`src/components/SidebarContent/SidebarContent.tsx`, `handleSessionPress`).
Navigating between drawer screens closes the drawer **as part of the same
transition** — one animation, one shared value, one frame budget.

**LiAI — three navigator levels, and two animations per press.**
- `app/_layout.tsx:47-56` — a root `Stack` owns the whole app.
- `app/(drawer)/_layout.tsx:13-28` — the drawer group contains exactly one
  screen: `<Drawer.Screen name="(tabs)" />`. So the drawer wraps the entire
  **tabs** navigator, not individual destinations.
- `app/(drawer)/(tabs)/chat.tsx`, `voice.tsx`, `vision.tsx` — the real
  destinations, one level deeper.
- Models/settings/about are **Stack screens pushed above the drawer**
  (`app/_layout.tsx:57-59`; the group comment at `(drawer)/_layout.tsx:6-8`).
- A drawer item does `onClose(); router.push(path)` in the same tick
  (`components/AppDrawer.tsx:36-39`), i.e. a drawer close animation **and** a
  Stack push animation start together.

## 4. Ranked root-cause hypotheses

### 1. A LiAI-only full-screen opacity fade races every drawer-driven switch (strongest)

`useTabContentFade` (`lib/motion.ts:50-66`) is mounted by every tab screen —
`chat.tsx:110`, `voice.tsx:43`, `vision.tsx:58` — and on every focus it
writes `opacity = 0` then `withTiming(1, 200ms)` on a wrapper around the
screen's content. The wrapper on chat is `<Animated.View style={contentFade}>`
around the message list (`chat.tsx:302-305`).

Why that is expensive precisely during a drawer switch: the animated view
wraps the **entire** tab content — a `FlatList` of markdown bubbles
(`components/chat/MessageList.tsx`, `components/chat/MarkdownView.tsx`) or the
camera preview. Animating `opacity` on a view with that subtree forces the
compositor to render it into an offscreen layer for the whole 200ms. That
competes, in the same frames, with the drawer's panel translation and scrim
alpha — three full-screen operations, two of them alpha, on an edge-to-edge
Android window (`app.json`: `targetSdkVersion 36`, `edgeToEdgeEnabled`).

Evidence FOR: the animation is unconditional on focus (`lib/motion.ts:55-60`),
its file comment states the navigator transition is off so "the content fades
itself in", and it is wired into all three tab screens. PocketPal has **no
equivalent** — its screen content never animates on navigation; the drawer
transition is the only motion (`pocketpal-ai/App.tsx:120-206`, no
transition/fade options anywhere).
Evidence AGAINST: it is a pure shared-value write, so it costs no React
render; it is a hypothesis until profiled on device (see §6).

### 2. Two concurrent animations per drawer press

`AppDrawer.tsx:36-39`: `onClose(); router.push(path);` in one handler. The
drawer close (`closeDrawer()`) and the Stack push (`router.push`) each start
their own animation in the same frame. PocketPal issues one `navigate()`
call, and the drawer close is implicit in that same transition
(`SidebarContent.tsx` handleSessionPress).

This is a structural difference, not a library one — and it is the difference
that the flat `Drawer.Navigator` design buys.

### 3. Nested navigators: the tab switch happens *inside* a drawer screen

Because the drawer holds the tabs navigator (`(drawer)/_layout.tsx:27`), a
tab switch animates the inner navigator while the outer one is mid-transition.
PocketPal has no nesting: drawer → screens. LiAI has Stack → Drawer → Tabs →
screen (`app/_layout.tsx:47-59` → `(drawer)/_layout.tsx:13` → `(tabs)/_layout.tsx:26-30`).

### 4. Custom drawer content mounted during the slide

`AppDrawerContent` renders `SessionList` (Supabase-backed sessions) plus a
footer of items (`components/AppDrawer.tsx:64-125`). It stays mounted while
the panel slides. PocketPal's `SidebarContent` is a paper `SectionList`
(`pocketpal-ai/src/components/SidebarContent/SidebarContent.tsx:1-9`) — also
mounted, so this is a weaker difference; listed for completeness.

## 5. What PocketPal does that LiAI does not

| | PocketPal | LiAI |
|---|---|---|
| Destinations | flat `Drawer.Screen` list (`App.tsx:120-206`) | drawer wraps `(tabs)`; models/settings/about are Stack screens above it |
| Press handler | one `navigation.navigate(...)` | `onClose()` **and** `router.push(...)` (`AppDrawer.tsx:36-39`) |
| Content on navigation | no fade, no transition options | `useTabContentFade` on all 3 tabs (`lib/motion.ts:50`) |
| Per-screen HOC | `gestureHandlerRootHOC` per screen (`App.tsx:130`) | one `GestureHandlerRootView` at root (`app/_layout.tsx:38`) — sufficient, not a cause |

## 6. Recommended fix list, by expected impact

1. **Delete or gate `useTabContentFade`** (biggest expected win, cheapest
   change). It is the only LiAI-only animation in the path. If a fade is
   wanted for tab-bar switches, apply it only when the switch comes from the
   tab bar, not when the drawer closes — or move it to the tab bar's own
   items rather than the whole content subtree.
2. **One navigation per drawer press.** Either call `router.push` and let the
   drawer close implicitly (requires the target to live inside the drawer
   group), or close-then-push serialized on the close animation's completion
   instead of in the same tick.
3. **Flatten to PocketPal's shape**: make models/settings/about
   `Drawer.Screen`s instead of Stack screens above the drawer, so every
   drawer press is one `navigate()` inside one navigator.
4. **Profile before shipping 1–3.** The ranking is derived from code and
   platform behaviour, not from a trace. A quick check: disable
   `useTabContentFade` (one-line) and observe; if the jank is gone, cause #1
   is confirmed and items 2–3 are the remaining polish.

## 7. Open questions for device verification

- Is the jank on **Android only**? (Edge-to-edge + alpha compositing is
  the theory; iOS would isolate it.)
- Does it jank on **drawer swipe-close** too, or only on item press? Swipe
  close has no navigation, so a jank there would point at content
  compositing (cause #1) rather than the double navigation (cause #2).
- Does tapping a **session in the drawer** (a tab switch rather than a push)
  jank the same way as tapping Models (a Stack push)? That distinguishes
  cause #1 from cause #2.
