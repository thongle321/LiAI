Status: ready-for-agent
Type: task
Blocked by: 08

# Ticket 17 — Corrections found by the code review of the migration

Findings raised against `feat/jest-test-migration` that were resolved by
verifying the claim and, where the claim was wrong, recording why. Nothing
here needs work unless the note says so; the ticket exists so the review's
open questions are answered in the repo rather than in a chat log.

## Findings and resolutions

### 1. `any` in ported tests — fixed

Every ported suite carried a hand-rolled `const assert: any = {...}` node:test
facade (17 files, ~500 call sites). All of them are now Jest matchers;
`grep -rn "any" --include=*.test.ts*` over the ported suites reports only
prose. No test helper uses `any`.

### 2. `@react-native/jest-preset` — **not removable; kept**

The review called it an unused devDependency. It is not unused, and removing
it breaks the whole suite: `jest-expo`'s package declares it as a
**peerDependency** (`^0.86.3`) and its preset file throws at load when it is
missing —

```
The React Native Jest preset that jest-expo relies on has moved to a separate
package. To migrate, please install "@react-native/jest-preset" to fulfill
jest-expo's peer dependency.
```

`react-native` itself declares the same peer at an exact `0.86.3`. Verified
by removal: with the dependency gone from `package.json`, `npm install`
installs nothing in its place and `npx jest` fails with the validation error
above. Keeping it as an explicit devDependency is Expo's documented migration
path, which is what the project already does. No change.

### 3. Native module mocks — fixed

`__mocks__/external/` now carries typed mocks for `expo-speech`,
`expo-speech-recognition`, `expo-sqlite`, `expo-linking` and `expo-font`,
wired through anchored `moduleNameMapper` entries in `jest.config.js`
(anchored so `@expo/ui/jetpack-compose` and `@expo/ui/swift-ui` still resolve
to the real platform modules). `tests/module-boundary-mocks.test.tsx`
imports each one so a mock that throws at import time fails loudly.

### 4. Source-text checks in the chat store — fixed

Three guards read `store/chat/sessions.ts` / `store/chat/send.ts` and counted
strings. Two were replaced by behavior tests; one was removed:

- "every conversation-reset site clears it" → drives `newConversation`,
  `switchSession`, `duplicateSession` and both `deleteSession` branches
  through the store and asserts the notice.
- "the guard lives in runLocal, so every re-run path shares it" → retry,
  regenerate and edit-and-resend each re-run the multimodal gate against a
  capability that flipped after the first send.
- "runLocal holds the yield for the whole turn and releases it on exit" →
  **removed.** Its subject is a `setTimeout` beat that `runLocal` starts and
  releases; the store exposes no observable for it (production passes no
  `onTick`), so there is nothing to assert but source text. The component it
  protects (`startStreamYield`) is covered behaviorally. See the follow-up
  below.

### 5. Router mock now assertable — fixed

`jest.setup.ts` used to mint fresh `jest.fn()`s inside `useRouter()`, so no
test could observe a navigation. The mocks now live in `jest/router-mock.ts`
as one exported, typed `routerMock` object, reset in a global `beforeEach`,
and imported by both setup and tests. `tests/route-smoke.test.tsx` asserts
`routerMock.push` from a rendered component and asserts that a previous
test's call does not leak.

### 6. `@expo/ui` mock was `() => ({})` — fixed

Replaced with `__mocks__/external/@expo/ui.tsx`, a real component stub whose
exports render their children. `tests/module-boundary-mocks.test.tsx` mounts
`Host` containing `Switch`, `Slider`, `Picker` and `BottomSheet`.

## Follow-ups

- **Streaming-yield wiring guard.** If Stop is ever observed not responding
  mid-stream on device, the fix may be to grow the beat's observability — a
  `onTick` seam on `runLocal` that a test can count — rather than to delete
  it. Ticket 09 tracks the chat store's remaining behavior work; fold this in
  there.
