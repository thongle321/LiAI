# Chat message UI parity — assistant reply surface

Date: 2026-10-06. Status: ready-for-agent (parent spec).
Audit of record: `docs/research/2026-10-06-pocketpal-chat-message-ui-audit.md`.
Tickets: `.scratch/chat-message-ui-parity/issues/01`–`10`.

Scope is the **assistant reply surface**: the pending row, the turn footer, markdown
tables, context-window messaging and recovery, user-row delivery state, and how a
turn's blocks are laid out. HTML preview (§3.7) already shipped and is named here
only as a dependency of the context-banner work.

Read the audit's §2 before treating anything below as a gap: LiAI is ahead on
thirteen items, and several apparent differences are deliberate choices that must
**not** be ported backwards.

---

## Problem Statement

When LiAI is working, the app tells the user much less about what is happening than
PocketPal does, and when a conversation outgrows the context window it offers less
way out.

Concretely, a user watching a turn run sees three blinking dots and a seconds
counter. They cannot tell whether the model is fetching a page, doing arithmetic,
or has stalled — and when they press Stop, the indicator simply vanishes rather than
acknowledging that the turn is unwinding. Long tool calls look exactly like long
thoughts.

Once a reply arrives, the footer reports generation speed but not how fast the
prompt was consumed, so a user with several thousand tokens of conversation history
has no way to see why the first token took as long as it did.

When the conversation fills the context window, LiAI shows the fact and the sizes but
offers no graduated way forward: there is no ladder of larger context sizes, no
indication of whether a given size would actually fit in this device's memory, and
no guidance past the last size that fits. A user on a memory-constrained phone is as
likely to pick a size the device cannot load as one it can.

Finally, a user whose message failed to send sees a row indistinguishable from one
that sent, and a long conversation mounts every row at once.

## Solution

Bring the assistant reply surface to PocketPal parity on the points where the gap is
real, and leave the thirteen places where LiAI is already ahead exactly as they are.

The pending row names the phase the model is in and stays visible while a stopped
turn unwinds. The footer reports prompt throughput alongside generation throughput.
The context-full banner escalates when the problem repeats, names the tool that
caused it, warns when a remote reply was cut off mid-sentence, and speaks up once
several HTML previews have accumulated. A graduated sheet offers larger context
sizes, each labelled with its memory cost and marked fits, tight, or won't fit for
this specific device. User rows carry a delivery state that includes failure. An
assistant turn renders as the ordered sequence of blocks the model actually produced.

None of this requires a backend, and none of it adds a dependency.

## User Stories

### Pending row

1. As a user, I want the pending row to name what the model is doing right now, so that a long silence reads as progress rather than a hang.
2. As a user, I want the HTML-preview tool to show "Building page", so that I know a page is being assembled rather than text being written.
3. As a user, I want the calculator to show "Calculating", so that a pause during arithmetic is explained.
4. As a user, I want the date-and-time tool to show "Looking up time", so that the pause before a timestamped answer is explained.
5. As a user, I want an unfamiliar tool to show "Preparing tool", so that a tool I have not seen before still tells me something.
6. As a user, I want no phase label at all while the model is simply writing text, so that the row does not claim a tool is running when none is.
7. As a user, I want the phase name and the elapsed seconds joined on one line, so that the row reads as a single status rather than two fragments.
8. As a user, I want the elapsed seconds to keep counting exactly as they do today when no phase label applies, so that this change costs me nothing when no tool is involved.
9. As a user, I want the phase name to update the moment the model moves from one tool to the next, so that the row never flashes empty between tools.
10. As a user, I want to hear the phase name through my screen reader when it changes, so that the information is not sighted-only.
11. As a user, I want the row to keep showing when the model has switched from writing text into assembling a tool call, so that a long tool call is visible.

### Stopping and tool-call progress

12. As a user, I want the row to read "Stopping…" after I press Stop, so that the app acknowledges my press instead of the indicator vanishing.
13. As a user, I want "Stopping…" to be the only thing on the row, so that a stopping turn is not confused with a running one.
14. As a user, I want the row to clear once the turn has finished unwinding, whether it succeeded or failed, so that it never sticks.
15. As a user, I want to be able to send a new message as soon as I press Stop, so that acknowledging the stop does not cost me the ability to keep talking.
16. As a user, I want a live count of tokens spent assembling a tool call once it passes ten, so that a long tool call shows progress rather than only elapsed time.
17. As a user, I want that count to never count my reply text, so that the number is a real measurement and not an estimate dressed as one.
18. As a user, I want the count to reset at the start of each tool call and each turn, so that it always describes the work in front of me.
19. As a user, I want phase, token count and elapsed seconds joined in that order, so that the row reads consistently however much it has to say.

### Turn footer

20. As a user, I want the footer to report prompt tokens per second, so that I can see why the first token was slow.
21. As a user, I want that reading hidden when the engine does not report it, so that the footer never shows a zero or a NaN dressed as data.
22. As a user, I want prompt throughput formatted to two decimals like the generation rate beside it, so that the two numbers are comparable.
23. As a user, I want the footer's existing readings unchanged, so that adding one does not disturb what I already read.
24. As a user, I want to keep the cached-token figure the engine reports for context occupancy, so that my cached tokens are never double-counted into an inflated number.

### Markdown tables

25. As a user, I want a table written with centred and right-aligned columns to render aligned as I wrote it, so that numeric columns line up.
26. As a user, I want a table written without alignment markers to look exactly as it does today, so that this change is invisible when I have not asked for alignment.
27. As a user, I want wide tables to keep scrolling horizontally, so that alignment does not cost me the overflow behaviour.

### Context window messaging

28. As a user, I want the context-full banner to escalate its wording after the same failure twice in a row, so that a persistent problem stops looking like a passing one.
29. As a user, I want any successful turn to reset that escalation, so that it never fires on a problem that has gone away.
30. As a user, I want the context-full banner to name the tool that needs the most room, so that I know what to stop using in a long conversation.
31. As a user, I want the banner to say plainly that this device is out of room when I am on a remote model, so that I am not sent to increase a context size that will not help.
32. As a user, I want a warning when a remote reply stops mid-sentence without ending punctuation, so that a truncated answer is not mistaken for a complete one.
33. As a user, I want no such warning when the reply ends properly, so that the banner stays meaningful.
34. As a user, I want to be told once several HTML previews have piled up in one conversation, so that I understand why it has started to feel slow.
35. As a user, I want that preview warning to appear even when no model is loaded, so that it is available exactly when I am looking at an old conversation.
36. As a user, I want to dismiss any of these banners, so that a message I have already read does not keep taking my attention.
37. As a user, I want a dismissed banner to stay dismissed until the next turn, so that it does not reappear mid-thought.
38. As a user, I want all banner variants to occupy the same single slot, so that only one is ever competing with the composer.

### Choosing a larger context

39. As a user, I want to be offered only context sizes larger than my current one and no larger than my model supports, so that every option is real.
40. As a user, I want each offered size to show its memory cost and roughly how much text it holds, so that I can tell what I am choosing.
41. As a user, I want each size marked as fitting, tight, or not fitting for this device, so that I do not pick a size my phone cannot load.
42. As a user, I want sizes labelled in thousands, so that a twelve-thousand-token option reads as "12K".
43. As a user, I want the sheet to open on the largest safe option rather than the smallest, so that the default is useful.
44. As a user, I want to be told that reloading takes a few seconds and loses nothing, so that I am not afraid to confirm.
45. As a user, I want the model reloaded at the size I chose, so that the change actually takes effect.
46. As a user, I want my previous size restored and my model left loaded if the reload fails, so that a failure costs me a moment rather than my session.
47. As a user, I want to be told plainly when no larger size fits this device, so that I am not offered a slider with nothing on it.
48. As a user, I want a new chat offered instead of a size when nothing fits, so that I have a way forward.
49. As a user, I want the context-full banner to offer more room only when a larger size genuinely fits, so that the action never leads to an empty picker.

### Turn layout

50. As a user, I want an assistant reply to show its reasoning, its tool result and its text in the order the model produced them, so that the reply reads as one narrative.
51. As a user, I want a tool result to sit beside the text rather than nested inside it, so that I can tell what the model did from what it said.
52. As a user, I want copying a reply to copy all of its text, so that the clipboard matches what I read.
53. As a user, I want read-aloud to speak the whole reply, so that I hear the complete answer.
54. As a user, I want a reply with no tools to look exactly as it does today, so that the common case is unchanged.
55. As a user, I want reopening an old conversation to show the same layout it was written with, so that history is not reflowed.
56. As a user, I want my existing backups to restore intact, so that this change cannot cost me my history.

### Delivery state and list performance

57. As a user, I want a message that failed to send to be visibly marked as failed, so that I do not believe I have said something I have not.
58. As a user, I want the failure mark to clear when a retry succeeds, so that a recovered message reads normally.
59. As a user, I want sending and sent messages to keep their current appearance, so that success states are unchanged.
60. As a user, I want a long conversation to open and scroll without mounting every message at once, so that the chat stays responsive.
61. As a user, I want every message still reachable when scrolling, so that windowing costs me nothing.

## Implementation Decisions

### Pending row

- A new pure module owns the talent-name-to-label mapping. Names map to their own
  label; an unrecognised name maps to a generic "preparing" label; **no** name yields
  **no** label rather than a generic one, so the row claims nothing when no tool is
  running. This mirrors PocketPal's fallback chain exactly.
- The pending row gains access to the in-flight tool name through a store selector
  over the streaming turn's steps, rather than by threading a prop through every
  caller. The row currently receives only the turn's start time.
- The rendered suffix is assembled by a pure formatter that takes an optional phase,
  an optional tool-call token count and an elapsed value, drops absent parts, and
  joins what remains with a middle dot. Rendering never assembles the string itself.
- The existing spoken accessibility label is extended to carry the phase name. It
  already carries the elapsed count, and losing that would be a regression.

### Stopping

- A distinct stopping flag is introduced in the send slice, set when Stop is pressed
  and cleared when the turn's loop exits — success or failure.
- **The stopping flag is separate from the in-flight flag, and does not hold it.**
  PocketPal holds its in-flight state through teardown, which is why its composer
  blocks; LiAI's existing behaviour clears the in-flight flag synchronously so the
  composer frees immediately. The flag split keeps that benefit *and* adds the
  acknowledgement, so the documented trade-off is resolved rather than accepted.
- While the stopping flag is set the pending row renders the stopping label alone,
  suppressing phase, token count and elapsed seconds.
- The component's existing comment recording why stopping was omitted is rewritten to
  record the reversal and its resolution, so the decision is not relitigated again.

### Tool-call token count

- The counter increments only on deltas that arrive while a tool call is being
  assembled, never on reply text. This is the specific distinction that makes
  PocketPal's count honest and the one LiAI's original objection was aimed at, so the
  invariant is enforced at the increment site and named in the test.
- The count resets at the start of a tool call and at the start of a turn.
- A minimum threshold of ten suppresses the reading below it; at or above it the
  count is shown with locale separators.
- The counter lives outside the render path so that ticking it does not re-render the
  whole message list — the same reasoning that keeps our pending timer cheap.

### Turn footer

- The domain timings type gains an **optional** prompt-throughput field. Optional
  rather than zero-defaulted, so "the engine did not report it" and "the engine
  reported zero" stay distinguishable at the type level.
- The local engine maps the engine's prompt-throughput field through the same
  numeric-sanitising helper the other timings use, so a non-finite value becomes
  absent rather than `NaN`.
- The footer renders the segment only when the field is present and finite.
- **Not ported:** the cached-token count. Our engine's cached-token figure is already
  authoritative for context occupancy and the upstream alternative is a wire formula
  that would double-count against it. That rejection stays on the record.
- **Not ported:** draft acceptance. It is speculative-decode-only and we run no
  speculative decoding, so the row could never appear.

### Markdown tables

- The markdown library already applies per-column text alignment to each cell before
  the app's renderer is invoked; the app's cell wrapper renders those nodes without
  stripping their styles. This is established by reading the installed library, and
  the audit's original claim was reading the wrong layer.
- The work here is therefore a **proof, not a feature**. A test asserts both halves:
  the library maps each delimiter form to the expected alignment, and the app's cell
  wrapper passes children through untouched. If both hold, no production change is
  made and the audit item closes.

### Context banner resolution

- A new pure resolver turns the observed state into exactly one banner variant,
  following a fixed precedence: context-full, then context-warning, then the remote
  cut-off notice, then the HTML soft-cap notice, then none.
- Constants are carried over: the fill threshold at four fifths, the runway window
  near the limit, and the minimum token count before a remote reply is eligible for
  the cut-off warning.
- The cut-off predicate combines four conditions — remote origin, a finish reason
  that is not a length stop, a minimum token count, and content not ending in
  terminal punctuation. The punctuation test is a pure helper covering the same
  sentence-ending characters, including the full-width forms.
- The context-full message text is selected by its own precedence: remote first,
  then a named heavy tool, then the repeated-failure escalation, then the default.
  Remote wins outright.
- A "heavy tool" is a talent whose definition declares a recommended context cost.
  The tool-definition type gains an optional field for it, defaulting to absent so no
  existing tool changes behaviour.
- A consecutive-full-failure counter lives with the turn outcome, incremented on a
  context-full turn and reset by any successful turn.
- Dismissals are held per session and cleared when each turn is recorded, so a
  dismissal lasts exactly one turn.
- The HTML soft-cap notice counts HTML-preview surfaces in the conversation and fires
  at four. It is resolved outside the model-loaded branch so it can appear with no
  model loaded.
- All variants render into the single existing banner slot; no variant mounts inside
  the message list.

### Context fit classification

- A new pure classifier answers whether a model can be loaded at a candidate context
  size, returning fits, tight, or won't-fit. It compares the memory the load path
  would require against a safe ceiling and against the device's total memory, with
  inclusive boundaries on both.
- When total device memory cannot be read, tight is never returned — the classifier
  degrades to a binary rather than inventing a middle state.
- The memory figure comes from the estimator the model-load path already uses, so the
  number shown to the user is the number the loader acts on.
- A companion helper reports whether any larger size actually fits, so no caller can
  present a picker with nothing in it.
- The safe ceiling is derived from device memory at startup using a conservative
  fallback rule, and raised when a model successfully loads at a known size. This is
  new state; without it the classifier has nothing to compare against.

### Context ladder sheet

- The ladder is a fixed set of context sizes. Only sizes above the current setting and
  at or below the model's own maximum are offered, with the model's maximum appended
  as the rightmost stop when it is not already on the ladder.
- **The model's maximum context length is a precondition.** The ladder cannot be
  bounded without it, and this value's availability from the model's metadata is the
  single largest unverified assumption in the spec. It is resolved before the ladder
  UI is built, and the classifier ticket does not depend on it.
- Sizes are labelled in thousands, integral values without a decimal.
- Each stop shows its memory cost and an approximate word capacity derived from the
  token count, plus the fit classification for this device.
- The sheet opens with the first fitting size selected.
- Confirming reloads at the chosen size. **If the reload fails, the previous size is
  restored and the model is re-initialised**, so the end state is a loaded model at
  the previous size — not an unloaded one. A nested failure of that recovery is
  swallowed, because the new-chat action must stay reachable.
- When no larger size fits, the slider is replaced by an explanation and a new-chat
  action rather than a disabled confirm button.
- The context-full banner's more-room action opens this sheet and is absent entirely
  when no larger size fits.

### Turn layout

- The turn's data model gains an ordered block representation so reasoning, text and
  tool surfaces can interleave. This is the one architectural change in the spec and
  it reaches the turn producer, the domain message type, the session store and every
  message renderer.
- The split from a turn into an ordered block list is a pure function, so ordering
  and grouping are testable without a renderer.
- Copy and read-aloud derive their text from the whole turn rather than one fragment.
- Stored conversations keep their existing shape and are read through the splitter on
  load, so old conversations render with their original layout rather than being
  rewritten.
- Backups restore without loss; the new representation is additive at the storage
  boundary.

### Delivery state and windowing

- Message rows derive one of three delivery states — sending, sent, or failed. The
  failed state is set when a send fails and cleared when a retry succeeds.
- The message list takes explicit initial-render and per-batch render caps matching
  PocketPal's values.

## Testing Decisions

### What makes a good test here

Test externally observable behaviour through the highest seam available, never a
component's internals. Where logic can be isolated it is tested directly against its
real inputs and outputs. Where the only claim is about a component's props or wiring —
which cannot execute outside React Native — the test reads the component as text and
asserts the decision, with a comment naming why the behaviour is unreachable.

This is the convention already in the repo, and the spec adds no new test
infrastructure and no new dependency.

### Seam

**One seam: pure decision logic in `lib/`, tested directly under `node --test`;
component wiring pinned by source assertions.**

The test runner is the Node built-in with no React Native available, so component
behaviour is genuinely unreachable. Rather than introduce a renderer — and the
dependency and configuration that come with it — every decision this spec makes is
extracted into a pure module that the node runner can import, and what remains is
asserted against the component's source.

### Modules tested directly

- **Talent phase mapping and suffix formatting** — every mapping, the unmapped
  fallback, the no-tool case that yields no label, and the joining and omission rules
  for the suffix. Covers the absence of a label as a first-class outcome.
- **Stopping-state derivation** — that the stopping label suppresses the other suffix
  parts, and that it is independent of the in-flight flag.
- **Tool-call token counting** — that reply-text deltas never increment the counter,
  that it resets at tool-call and turn boundaries, and that the threshold hides small
  counts.
- **Timings mapping and footer formatting** — that a missing prompt-throughput field
  stays absent rather than becoming zero, that non-finite values are dropped, and that
  the decimal formatting matches the adjacent metric.
- **Table alignment** — that the installed library maps each delimiter form to the
  expected alignment, and that our cell wrapper does not strip it.
- **Banner variant resolution** — every variant, the full precedence order, each
  predicate's boundary conditions, the context-full copy precedence including remote
  winning outright, the escalation threshold, dismissal persistence, and the
  soft-cap count threshold. The terminal-punctuation helper is tested directly.
- **Context fit classification** — all three classifications, both inclusive
  boundaries, the unreadable-memory degradation, and the has-a-fitting-upgrade helper.
- **Ladder construction** — filtering above the current size and at or below the model
  maximum, appending the model maximum, labelling, and the no-fitting-size case.
- **Turn-to-block splitting** — interleaved reasoning, text and tool surfaces come out
  in produced order; a tool-free turn produces a single text block; a stored turn
  produced by the previous model splits into the same blocks.
- **Delivery-state derivation** — all three states, and the clear-on-retry transition.

### Modules pinned by source assertion

- The pending row receives the in-flight tool name and renders the formatted suffix,
  rather than assembling the string itself.
- The stopping flag is set on Stop and cleared on loop exit, and does not gate the
  composer.
- The tool-call counter increments only on tool-call assembly deltas.
- The prompt-throughput field is added to the domain timings type and mapped by the
  local engine through the sanitising helper.
- The banner renders exactly one variant from the resolver's output, in the single
  existing slot, with no variant mounted inside the message list.
- The ladder sheet is opened by the banner's more-room action, which is absent when
  no larger size fits.
- The message list carries the render-windowing props.
- Row rendering covers all three delivery states.

### Prior art

The pure-plus-source-assertion shape already exists in this repo and is the model
for every test above. `context-fill.test.ts` is the closest analogue — it tests
fill-ratio, effective-window and near-limit logic directly, then pins the chat
wiring against the component source in a second block. `markdown-tables.test.ts` is
the model for a renderer-override suite and is **extended** rather than replaced.
`truesheet-scroll.test.ts` and `html-preview-bubble.test.ts` are the model for
pinning a component's props, the latter because a web view cannot be exercised
outside a device.

### What is not tested here

Rendered appearance, animation and gesture behaviour are not covered and are not
reachable by this runner. They are verified on device.

## Out of Scope

- **Content reporting.** Upstream posts to a hosted endpoint behind app attestation.
  We have no backend, so this is infrastructure rather than a UI port, and it is
  recorded as blocked rather than as a gap.
- **Localisation.** Every upstream string is routed through a translation layer
  across twenty-plus languages. LiAI stays English-only; recorded as out of scope
  rather than as a gap.
- **The cached-token footer metric** and **draft acceptance**, for the reasons given
  under Implementation Decisions.
- **Everything LiAI already does better**, per the audit's §2 — notably the
  tap-to-retry error card, selectable markdown, the explicit heading scale, the
  link preview on assistant replies, tool metrics under failures, and the TTS stop
  state. These must not be regressed to match upstream.
- **Per-token stream yielding**, **inverted list ordering**, and **greeting bubble** —
  all deliberate divergences or not worth the surface.
- **Image and file message row types** beyond what already exists.
- **A talent-UI registry with a pending-render hook.** Upstream's version of this
  hook is declared and never called, so porting it would add an abstraction with no
  caller.
- **Any new runtime dependency.** In particular the HTML preview dependency already
  shipped alongside the feature that uses it.

## Further Notes

**The audit that prompted this spec was wrong in four places**, and each correction
shrank the work:

- Table alignment was reported missing. It is almost certainly already working — the
  installed markdown library applies per-column alignment before our renderer runs.
  That ticket is a proof and may close the item outright.
- The footer gap was reported as three metrics. One survives; the other two are
  already-rejected or inapplicable.
- The content-report sheet was listed as a port. It has no destination here.
- The pending-row gap reverses two decisions LiAI had written down deliberately.
  Both reversals are recorded in the tickets by name, so the reasoning survives
  rather than being silently overwritten.

**Two reversals are accepted knowingly**, per the parity decision: the stopping state
and the tool-call token count. The first is resolved rather than merely accepted — a
separate flag gives the acknowledgement without blocking the composer.

**One precondition is unverified and gates the ladder UI:** whether the model's
maximum context length is available from metadata at all. The fit classifier does not
need it and can proceed; the ladder cannot be bounded without it. This should be
resolved before the ladder UI ticket is picked up.

**One ticket carries architectural risk.** Multi-block rows change the turn data
model, the store and every renderer, and carry backup-compatibility obligations. It is
correctly sequenced last, behind the pending-row work that settles where a tool
surface's chrome lives, and it will not resemble the other nine in shape or risk.
