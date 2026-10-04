# Spec: Chat message actions (long-press menu, edit-and-resend, cross-model retry)

Date: 2026-09-29
Status: Draft — awaiting sign-off. **Steps 1 and 3 shipped** (see §3.1, §3.5).
Audit source: `docs/research/2026-09-29-pocketpal-chat-feature-audit.md` §4 (G3)

> **Decisions taken 2026-09-29 (grilling session), which changed this spec:**
>
> - **Delete-message was CUT.** PocketPal's menu is Copy · Regenerate ·
>   Regenerate with… · Edit · Report (`pocketpal-ai/src/components/ChatView/ChatView.tsx:673-741`)
>   and has **no delete-message action at all**. Its destructive branch truncation
>   happens implicitly through edit and regenerate, both calling
>   `removeMessagesFromId(id, true)` (`hooks/useMessageActions.ts:75,105`), with no
>   confirmation. An earlier draft of this spec added a Delete item that was neither in
>   pocketpal nor in the audit; it shipped, then was removed.
> - **Confirmation policy: none for branch truncation, yes for whole-session delete.**
>   That is pocketpal's own pattern (`HeaderRight.tsx:75-90` confirms only session
>   deletion). "Re-ask" verbs do not confirm, because discarding the branch there is the
>   expected consequence.
> - **The store port is now keyed by MESSAGE ID, not index** (Q6/Q9/Q11 below), matching
>   pocketpal's `removeMessagesFromId`. `StoredTurn` (write, no id) and `StoredMessage`
>   (read, id required) are split so the compiler rejects an unaddressable message.
> - **Export strips row ids** — they are our TinyBase layout, not the user's data, and
>   the exported format must stay what FORMAT_VERSION 1 defined.
Scope: what a user can do **to one message** in a conversation. No app code was modified
in this pass.

---

## 1. The gap, precisely

There is **no `onLongPress` handler anywhere in `components/chat/**`** (verified by grep;
the only hit in the repo is a test assertion at `tests/touch-targets.test.ts:71`). There is
no per-message menu of any kind.

Today `components/chat/MessageActions.tsx:41-79` puts copy, regenerate and speak on screen
under every assistant bubble, permanently. That is a reasonable design. The consequences of
it are what this spec fixes:

| Gap | Consequence today |
| --- | --- |
| No edit-and-resend | To re-run an earlier question the user must retype it. A typo three turns back means retyping three turns back. |
| No regenerate-with-another-model | PocketPal's cheapest quality lever. We have the model list; there is no way to reach it from a message. |
| No delete-message | Only `popLastAssistant` exists (`lib/chat/session-store.ts:79`), and `store/chat/send.ts:200-241` uses it for regenerate. A middle message cannot be removed at all. |
| No haptics | `expo-haptics` is a direct dependency (`package.json:22`) and imported only by `hooks/useVoiceLoop.ts`. The menu would have no tactile confirmation. |
| Report | Out of reach — ADR-0008 retired our backend, and PocketPal's is Firebase-App-Check-gated (`pocketpal-ai/src/api/feedback.ts:62-88`). **Skipped, see §6.** |

---

## 2. What PocketPal does

| Feature | Citation |
| --- | --- |
| Long-press opens a context menu, with an `impactLight` haptic first | `ChatView.tsx:664-742` |
| Items: Copy · Regenerate · **Regenerate with…** (model submenu) · Edit (user rows only) · Report content | same |
| Copy, edit, try-again, try-again-with-another-model | `hooks/useMessageActions.ts:33-116` |
| Edit mode: `enterEditMode` / `exitEditMode` / `commitEdit` | `ChatSessionStore.ts:1223-1261` |
| Branch-truncating regenerate: `removeMessagesFromId(id, true)` deletes the message **and everything after it**, then re-sends | `useMessageActions.ts:59-104`, `ChatSessionStore.ts:1271-1305` |
| Composer enters edit mode: spring-animated "Editing message" bar with ✕, field autofocuses, send commits and truncates history | `ChatInput.tsx:184-204`, `:390-408`, `:493-506`; `ChatView.tsx:513-517`, `:524-528` |

The truncating regenerate is the load-bearing idea: **regenerating anything other than the
last assistant turn is meaningless unless you can delete the branch it sits on.**

---

## 3. What we build

### 3.1 The store: one new port method

`SessionStore` (`lib/chat/session-store.ts:44-104`) gains:

```ts
/** Drop this turn and everything after it, for edit-and-resend and
 *  regenerate-from-the-middle. False when the session does not exist.
 *  Cascades to that turn's tool calls. */
truncateFrom(sessionId: string, turnIndex: number): Promise<boolean>;
```

The implementation is nearly free. `lib/chat/tinybase-store.ts:289-298` already has every
piece:

- `rowsOf(sessionId)` sorted by `seq` — the ordering the index is defined against.
- `deleteStepsOf(messageId)` — the `toolRuns` cascade already exists (`:301-307`).

So the body is: sort, slice from `turnIndex`, loop `deleteStepsOf` + `delRow` over the tail.
Roughly six lines.

**Keep `popLastAssistant` as-is.** It is called by regenerate today, is narrow, and returns a
boolean the caller checks. Replacing it wholesale is a refactor with no user-visible gain.

`turnIndex`, not an id: the port already exposes turns as an ordered array via `get()`, and
the caller (the store slice) is the only thing that knows the index. Putting an id in the
port would force every caller to re-derive ordering that `truncateFrom` needs anyway.

#### Shipped 2026-09-29

`truncateFrom(sessionId, turnIndex)` is on the port, implemented, and tested — **but no
caller yet.** It is deliberately inert until step 3 wires the Delete action; nothing in the
app can reach it today.

- `lib/chat/session-store.ts` — port method, documented as additive.
- `lib/chat/tinybase-store.ts` — sorts by the same `seq` order `get()` hands the caller, so
  the index cannot drift.
- `tests/fakes.ts` — the fake carries the same guards, so a test that passes there passes
  against the real store.
- `tests/tinybase-store.test.ts` — 7 cases.

**Two guards worth naming, because both are judgement calls rather than mechanics:**

1. **An out-of-range index drops nothing and returns `false`** — it does not clamp. A bad
   index is a bug to surface, not a conversation to silently destroy. Clamping would turn a
   one-line caller mistake into irreversible data loss.
2. **`updatedAt` is NOT bumped**, matching `popLastAssistant`. Truncation does change the
   conversation, so bumping is defensible — but consistency with the sibling method won, and
   the list re-sorts on `updatedAt` only for the sessions drawer, which truncation does not
   need to reorder. **Revisit if truncate ever runs outside an active conversation.**

The cascade test is the one that earns its place: it proves a surviving turn does not
inherit a removed turn's tool calls, which is the whole reason `deleteStepsOf` is called in
the loop rather than once.

### 3.2 Edit mode

Three pieces of local state on the chat route, lifted out of `MessageInput`:

| Piece | Behaviour |
| --- | --- |
| `editingIndex: number \| null` | Which user turn is being edited. `null` = normal mode. |
| "Editing message" bar | Renders above the control row. **In flow** — see §5. |
| Draft seeding | Opening edit mode seeds the composer draft with that turn's text. Uses the existing per-session draft store (`store/chat/draft.ts:29-50`), so a half-written edit survives a session switch like any other draft. |

On send while `editingIndex !== null`: `truncateFrom(session, editingIndex)`, replace the
turn's text with the draft, clear the edit state, then run the normal send. Per PocketPal
(`ChatInput.tsx:493-506`) the edit commits at send time, not on blur — so a cancelled edit is
just `exitEditMode` and the turn is untouched.

Gating: **user rows only.** Same as PocketPal (`:664-742`). Editing an assistant turn is
regenerate.

### 3.3 Regenerate from any turn

`truncateFrom(sessionId, index + 1)` — drop the assistant turn *and* everything after it,
then re-send the question. This is the behaviour of PocketPal's
`removeMessagesFromId(id, true)` and it is the only correct definition.

The existing regenerate path stays the fast path for the last turn: it already calls
`popLastAssistant`, which is cheaper and preserves its boolean contract.

### 3.4 Regenerate with another model

A model submenu inside the action menu, listing `useModelStore`'s `models` (downloads) and
`remoteApis` — the **same source and the same "Active" marker** as the model submenu already
built at `components/chat/ChatMenu.tsx:254-281`. Do not write a second model list.

Choosing one: `setActiveModel(id, "local")` / `setActiveRemoteApi(id)`, then the truncate +
re-send above. `EngineManager` swaps the slot on the next `ensure()` without any extra
plumbing (`lib/inference/manager.ts:63-97`).

### 3.5 The menu itself

**Use `@expo/ui/community/menu` — it is already a direct dependency** (`package.json:9`,
`@expo/ui ~57.0.21`). *(An earlier draft of this spec claimed `@expo/ui` was not
installed. It is. `AGENTS.md` names menus as a default `@expo/ui` component, and
`build/community/menu/index.d.ts` exports a `MenuView` with native per-platform
implementations — SwiftUI `Menu`/`ContextMenu` on iOS, a Compose `DropdownMenu` on Android.)*

`MenuComponentProps`
(`node_modules/@expo/ui/build/community/menu/types.d.ts`) covers the whole spec:

| Need | Prop |
| --- | --- |
| Long-press is the trigger | `shouldOpenOnLongPress` — opens on long-press instead of tap |
| “Regenerate with…” model list | `subactions` — a real native submenu, not a hand-rolled panel |
| Delete styled destructive | `attributes.destructive` |
| Edit hidden on assistant rows | `attributes.hidden` (better than disabled: it removes the row) |
| The active model checkmark | `state: 'on'` |
| Dispatch | `onPressAction` → `nativeEvent.event` is `action.id ?? action.title` — **set an explicit `id` on every action**; do not rely on the title fallback |

Three platform caveats, from the same types file. Read before implementing:

- **Skip icons.** `image` is `SFSymbol | ImageSourcePropType`: an SF Symbol name renders on
  iOS and is *ignored* on Android; an `ImageSource` renders on Android and is *ignored* on
  iOS. Supplying both is the only way to get icons on both platforms, and `titleColor` /
  `imageColor` are documented as unreliable on iOS. **Titles alone are the low-friction
  choice**; add icons only if the design demands them.
- **No programmatic open on iOS.** `MenuComponentRef.show()` is Android-only and warns on
  iOS (“SwiftUI `Menu`/`ContextMenu` have no programmatic open API”). Long-press as the
  trigger sidesteps this entirely — which is why `shouldOpenOnLongPress` is the right
  primitive here and not merely a convenience.
- **Do not rely on `onOpenMenu` / `onCloseMenu`.** Both are `@platform android`; iOS exposes
  no close hook to forward.

Haptic: `expo-haptics` is a direct dependency (`package.json:22`) imported only by
`hooks/useVoiceLoop.ts`. Fire `impactLight` on the row's long-press before the menu opens.

Items:

| Item | Rows | Menu action |
| --- | --- | --- |
| Copy | all | `id: "copy"` — existing clipboard path in `MessageActions.tsx` |
| Edit | user only (`attributes.hidden` on assistant) | §3.2 |
| Regenerate | assistant only (`attributes.hidden` on user) | §3.3 |
| Regenerate with… | assistant only, `subactions` of models | §3.4 |
| Delete | all, `attributes.destructive` | `truncateFrom(index)` |

`onLongPress` has to coexist with the existing row tap, used for image enlarge (audit G15,
also unimplemented). If both land: **tap on an image row enlarges, long-press anywhere on
the row opens the menu.**

### 3.6 Do the always-visible actions move?

**Recommendation: keep them.** Copy and regenerate stay on screen; the long-press menu is
additive. Two reasons: removing them is a regression for anyone who has learned the current
UI, and they are the two most-used actions. The menu's value is precisely the actions that
*cannot* live on screen — edit, delete, cross-model — which have no permanent home.

This is a design call, not an audit finding (audit §6.5). Flagged for sign-off.

---

## 4. Sequencing

| # | Change | Notes |
| --- | --- | --- |
| 1 | ~~`SessionStore.truncateFrom` + TinyBase impl + test~~ **DONE** | Shipped 2026-09-29. Seven cases, including the `toolRuns` cascade and the out-of-range guards. |
| 2 | ~~`truncateFrom` test doubles as the delete check~~ **DONE** | Covered by step 1's cascade + out-of-range cases. |
| 3 | Long-press + haptic + `MenuView` with Copy / Delete | Smallest user-visible slice. **This is the next step**, and the first thing that makes `truncateFrom` reachable. |
| 4 | Regenerate-from-any-turn | Reuses step 1's port method. |
| 5 | Edit mode: state, bar, draft seeding, commit-on-send | Largest piece; touches the composer, which is the most regression-prone surface on the screen (see §5). |
| 6 | Regenerate-with-another-model via `subactions` | Last — it is step 4 plus a submenu, and it is the least often used. |

---

## 5. Risk: the edit bar is in flow, and the composer is measured

`MessageInput`'s box is measured by `onLayout` and that height is what the message list
reserves (`app/(drawer)/(tabs)/chat.tsx:141-153`). Its header comment
(`MessageInput.tsx:225-238`) sets out the current rule: **rows the field owns are in flow
and counted; chrome that is not part of the field is an overlay in `chat.tsx` and reserves
nothing.**

The "Editing message" bar is unambiguously the former — it belongs to the field's state and
nobody else could own it. So it goes **in flow, inside `MessageInput`, above the control
row**, and the existing measurement picks it up for free.

What must not happen: putting it in the `chat.tsx` overlay row. That row is positioned over
the list precisely so that appearing chrome does not reflow the list
(`chat.tsx:379-386`), and an edit bar is chrome the user can dismiss at any moment. The
in-flow placement is both correct and free.

Same reasoning rules out the store's current treatment of the voice and attach issue lines
— those are already in flow (`MessageInput.tsx:243-268`) and stay exactly as they are.

---

## 6. Not building

- **Report content / report a model error.** PocketPal posts to a Firebase-App-Check-gated
  endpoint (`api/feedback.ts:62-88`, `:227-330`). ADR-0008 retired our backend, so there is
  nowhere to post and no identity to attribute a report to. Listed in the audit for
  completeness; **not actionable** until a backend exists.
- **The "interrupted"/"cut off" footer markers** — these belong to
  `docs/specs/2026-09-29-chat-turn-signals-and-lifecycle.md` (§5) and land with that spec,
  not here.
- **Message deletion via swipe.** One verb, one gesture. The menu is enough; a swipe
  gesture on a scroll view that also does interactive keyboard dismissal is a conflict
  waiting to happen.

---

## 7. Resolved 2026-09-29

> These were open questions when the spec was drafted. All three are now decided and
> implemented; the answers are recorded here so the code and this document agree.

1. ~~**Does a truncated branch need a confirmation?**~~ **MOOT.** The question only existed
   because this spec originally added a Delete action. Delete was CUT (see the header note):
   PocketPal has no delete-message action, and its branch truncation happens implicitly
   through regenerate and edit, with no confirmation. So there is no destructive menu verb
   left to confirm. PocketPal's actual pattern — confirm only whole-**session** delete, never
   a "re-ask" verb (`HeaderRight.tsx:75-90`) — is what we follow.

2. ~~**Should the edit bar's ✕ restore the composer draft to its pre-edit value?
   Recommendation: yes**~~ **ANSWERED THE OTHER WAY; the reversal is deliberate.**
   `cancelEdit` restores the **edited turn's own text**, discarding whatever the composer held
   before edit mode was entered. Edit mode *seeds* the field from the turn, so the pre-edit
   composer text is not what the user was looking at when they hit ✕ — the field read "q1"
   (seeded), and on cancel it reads "q1" again. Restoring the half-written pre-edit text
   would be restoring a state the user never saw while editing. The original recommendation
   was written before the seeding behaviour was pinned down.

3. ~~**Does edit mode need to disable attach/dictation?**~~ **DEFERRED, explicitly.** Neither
   is disabled yet. This is a decision, not an oversight: dictating while editing rewrites
   the text being corrected, but the composer already ignores dictation while a turn is
   running, and edit mode sits next to that rather than being the same thing. Left alone
   until someone finds it annoying, which is the only evidence that would settle it.

**Still open (neither decided nor implemented):**

- **Images in edit mode.** PocketPal's `handleEdit` restores the turn's own images into the
  composer (`hooks/useMessageActions.ts:56`). We restore text only, so editing a turn that
  had a photo silently drops it. Our types carry one image per turn (`types/chat.ts`), so
  this is small whenever it is wanted — but nobody has asked, and guessing here would be
  inventing behaviour.
- **The iOS long-press haptic** remains best-effort and unverified on hardware (§3.5).
