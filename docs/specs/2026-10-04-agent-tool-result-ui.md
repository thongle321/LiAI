# Spec — Agent tool result UI (audit G5)

Status: Draft — awaiting sign-off.
Investigated: 2026-10-04. Governing docs: `docs/research/2026-09-29-pocketpal-chat-feature-audit.md`
(§3.7 agent tools), this file, and `docs/adr/0009-*` (talent registry).

---

## Problem Statement

When the model calls a tool, the chat screen shows only the tool's **name** — a grey chip reading
`web_search`. The result the tool returned is persisted and never rendered.

Two consequences, in order of how much they hurt:

1. **A failed tool is invisible.** The talent seam returns a `Promise<string>` for both success and
   failure, so `web_search: no results for "x"` and `read_url: request failed (500)` arrive as
   ordinary-looking text. The model then phrases its answer around a failure, and the bubble looks
   exactly like a reply that simply changed its mind. The user cannot tell the model lost a tool
   from the model choosing not to use one.

2. **A successful tool is unverifiable.** After a web search the user sees the chip appear and then
   has to take the answer's citations on trust. There is no way to look at what was actually
   retrieved, so there is no way to check whether the answer is grounded.

The user cannot tell what the app did on their behalf.

## Solution

Surface every tool call the way the user would expect, mirroring pocketpal's dispatch:

- A **failed** tool renders as a distinct error block, never as a result.
- A **successful** tool renders through a renderer chosen for that tool by name, so `web_search`
  becomes a readable list of hits rather than a markdown blob, and `read_url` becomes collapsible
  extracted text.
- A tool with no renderer still shows a "used X" chip, so nothing silently vanishes.
- The judgement of **ok vs error** is made at the talent seam, where the truth is known, and is
  persisted so a reloaded conversation still knows which it was.

## User Stories

1. As a user, I want a failed tool call to be visibly distinct from a successful one, so that I
   do not read a confident-sounding answer that was actually built on a failed lookup.
2. As a user, I want to read the error a tool returned, so that I can judge whether to retry,
   change the question, or fix a configuration problem.
3. As a user, I want the error to name the tool, so that I know which capability failed.
4. As a user, I want a web search to render as a list of results with titles, URLs and snippets,
   so that I can read what was found without parsing markdown.
5. As a user, I want to tap a web search result and open the page, so that I can check a source
   myself rather than trusting the summary.
6. As a user, I want a page read to render as collapsible text, so that a long article does not
   push the answer off-screen.
7. As a user, I want long tool output collapsed by default, so that a 6,000-character page read
   does not swamp the conversation.
8. As a user, I want to expand and collapse tool output, so that I control how much detail I read.
9. As a user, I want a calculation result rendered plainly, so that it reads as a number rather
   than prose.
10. As a user, I want a datetime result rendered plainly, so that it reads as a time.
11. As a user, I want to still see that a tool was used even when it has no custom renderer, so
    that no tool call silently disappears from the transcript.
12. As a user, I want tool surfaces collapsed to a summary row, so that a five-tool turn does not
    bury the answer it produced.
13. As a user, I want the tool surfaces to expand inline within the bubble, so that I do not lose
    my reading position.
14. As a user, I want the error state to carry a glyph and a word as well as colour, so that it
    is not conveyed by colour alone.
15. As a user, I want each tool surface to meet the 48dp touch-target floor, so that it is usable.
16. As a user, I want each tool surface to announce itself to a screen reader, so that I know a
    tool ran and what it returned.
17. As a user, I want an error block to be announced when it appears, so that I do not miss a
    failure.
18. As a user, I want collapsed tool output to expose its summary to a screen reader, so that I
    can decide whether to expand it.
19. As a user, I want tool calls to render in the order the model made them, so that the
    transcript reads as a sequence of reasoning steps.
20. As a user, I want the tool surface to still be collapsed after the app restarts, so that
    reopening a conversation does not dump every page read into view.
21. As a user, I want a conversation reloaded from disk to still show which tool calls failed, so
    that an old failure is not silently repaired by a reload.
22. As a user, I want a tool that is still running to show nothing yet, rather than an empty
    error block, so that I am not told something failed while it is still working.
23. As a user, I want the pending indicator to cover the in-flight window, so that I know why
    nothing has appeared yet.
24. As a user, I want a web search whose results were empty to read as a clear empty result, so
    that "no results" is not confused with "search failed".
25. As a user, I want the search query shown with its results, so that I know what was looked up.
26. As a user, I want a truncated page read to say so, so that I do not mistake a 6,000-character
    cut for the whole article.
27. As a user, I want a tool surface to not intercept the long-press message menu, so that I can
    still copy or regenerate the turn.
28. As a user, I want to dismiss an open result by tapping outside it, so that closing is
    easy. (Corrected 2026-10-04 — this originally read "I want tapping outside an *expanded*
    surface to collapse it". That was INVENTED: pocketpal has no inline expanded state at all,
    so there was never anything to tap outside of. See the correction note below.)
    easy.
29. As a user, I want per-tool rendering to be registered by name, so that adding a fifth tool does
    not require editing the chat screen.
30. As a user, I want a tool with no registered renderer to degrade to a chip rather than
    crashing, so that a new tool is never worse than today.
31. As a user, I want tool results to survive a conversation export and import, so that a backup
    keeps them.
32. As a developer, I want tool outcomes stored in a form that distinguishes success from error, so
    that no rendering layer has to parse English to find out what happened.
33. As a developer, I want the discriminant decided once, at the seam that knows the truth, so
    that the judgement cannot drift between layers.
34. As a developer, I want adding the outcome kind to be purely additive to storage, so that
    existing conversations keep working without a migration.
35. As a developer, I want a conversation written before this change to render sensibly, so that
    old data is never a crash.
36. As a developer, I want the error/success judgement covered by tests at the talent seam, so that
    a regression is caught where the truth is known.

## Implementation Decisions

**Match pocketpal's shape rather than inventing one.** The reference dispatches each tool outcome
into one of four cases, in this order: an error block when the result is an error; otherwise a
renderer registered for that tool's name; otherwise a "used X" chip; and nothing at all while the
outcome has not landed, because the chat screen's own pending indicator covers the in-flight
window. A metrics footer renders as a sibling beneath the result. This spec adopts that ordering
verbatim so behaviour is comparable side by side.

**The discriminant is produced at the talent seam, not inferred downstream.** pocketpal's outcome
carries an explicit `type`, and its error variant carries a message. Ours currently returns a bare
string from every talent, which is precisely why failures are invisible. The talent seam's return
becomes a structured outcome carrying a success/error discriminant, the tool name, and the content.
Every talent keeps the same "never throws" contract it has today: a talent failure becomes an
error outcome, not an exception. The four-case dispatch in rendering is therefore a plain read of a
field, with no string parsing anywhere.

**Tool name keys a renderer registry.** Rendering resolves a renderer by tool name from a registry
populated at module load, so a new tool acquires a surface without touching the chat screen. This
is the same registry shape pocketpal uses, and it is the reason its four surfaces are extensible
rather than a switch statement.

**Storage is additive; there is no migration.** Tool results are already persisted on the tool-run
table and are read back today; only the rendering is missing. TinyBase columns are dynamic, so the
outcome kind is added as a new sibling column alongside the existing tool, input and result
columns. Rows written before this change simply have no value in that column, and are read as
"unknown outcome" — which renders as the conservative chip rather than as a success or a failure.
There is no data migration, no version bump in the export format, and nothing to re-write on disk.

**Tool kind is carried, not re-derived.** Because the outcome names its tool, a renderer registry
entry does not need to guess which tool produced a string, and the chat screen never parses
markdown to decide how to draw something.

**Only the surfaces these four tools need.** pocketpal also ships an HTML preview bubble and a
metrics footer. The HTML bubble was already ruled out of scope by the 2026-09-24 parity spec
because it requires a WebView, and is not revived here. The metrics footer is a separate concern
from tool results and is not part of this spec; per-tool timing already has a home in the turn
footer built under G4.

**Markdown is not reintroduced into the render path.** `web_search` currently returns its hits as a
markdown string for the *model* to read. That stays exactly as it is — it is the model's contract,
not the user's. The renderer parses the structured hits that the search layer already produces
before formatting them, rather than parsing the markdown back apart.

**Export and import carry the outcome kind.** The export boundary strips row ids and nothing else,
so the new field is included automatically once it is on the read shape. Import rebuilds tool calls
field by field as it already does for turns, so an imported conversation keeps its success/error
distinction — and an imported tool call carrying data this version cannot restore is counted and
reported, consistent with how import already treats unrecoverable turn data.

## Testing Decisions

A good test here asserts **observable behaviour through the public seam**, not the shape of
components. Concretely: given a talent returns a failure, the rendered surface is the error block
and not the chip; given it returns hits, the rendered surface offers the hits. It does not assert
on class names, component structure, or that a particular registry key exists.

**Primary seam: the talent registry.** This is the highest point at which the success/error decision
is observable, and it is where the regression risk actually lives — a talent returning a failure
shaped like a success. `tests/` already contains talent coverage, so this extends an existing seam
rather than creating one. Each of the four talents gets cases proving its failure mode produces an
error outcome and its happy path produces a success outcome.

**Secondary seam: the persisted read shape.** Tool-run rows written with and without the new
outcome-kind column are read back correctly, so a conversation written by the previous version
still loads. Prior art for exactly this exists in the turn-outcome-flag tests, which already pin
that a flag set to false is dropped rather than stored and that absence is tolerated on read.

**Store seam: dispatch.** Each of the four dispatch cases is covered — error, registered renderer,
unregistered tool, and not-yet-landed — because a regression in the ordering silently reintroduces
the original bug (an error rendered as a result).

**Rendering is source-scanned, not render-tested**, matching how this repository already guards
structural UI properties: the in-flow/lift rules, the menu ordering, the thinking pill's local
gate, and the attach brackets are all pinned by reading the source. Tool surfaces must keep the same
property that long-press on a bubble still reaches the message menu, and that belongs in that same
family of guard.

**Accessibility is asserted structurally**: every interactive control carries a role, a label, and a
state; error surfaces carry a live region so a failure is announced. This matches the touch-target
and font-rung guards already in the suite.

## Out of Scope

- **The HTML preview bubble.** Already deferred by the 2026-09-24 parity spec; it needs a WebView
  and no talent in this app produces HTML.
- **The per-tool metrics footer.** Timing already surfaces in the turn footer built under G4.
  Per-tool duration is a separate concern.
- **Speculative-draft acceptance**, as with G4.
- **Talents beyond the four that exist.** The registry is designed so adding one needs no chat
  screen change, but this spec does not add tools.
- **Content and model-error reporting** (G17), which is parked: it requires a backend and ADR-0012
  makes this application local-only.
- **Rendering tool results as citations inside the answer text.** The model writes its own prose;
  the surfaces sit beside the answer rather than inside it.

## Further Notes

- Two premises in the earlier framing of this gap were wrong and are corrected here. The first is
  that a stored-schema migration is required: results are already persisted, so the work is
  additive. The second is that a typed result union is required: the union needed is the
  success/error discriminant, which is a strictly smaller change than re-typing results per tool.
- The audit's stated consequence is accurate and worth preserving verbatim in the gap entry: a
  successful web search is currently unverifiable, and a failed one is indistinguishable from the
  model changing its mind. Both are consequences of one missing field.
- The litmus test for this work: a user who watches a web search fail should be able to say what
  went wrong, without reading the model's prose and guessing.

## Correction: a user story I invented, and the lesson

Story 28 originally read *"I want to tap outside an expanded surface to collapse it."* There is
no such thing. **pocketpal has no inline expanded state at all** — `WebSearchResultBubble` is a
collapsed row that opens a bottom sheet, so there is never an expanded inline surface to tap
outside of. Its dismissal is the sheet's own `onDismiss`.

The story survived because it was written into this spec without reading the reference first, then
"implemented against" by a review that checked the code against *this document* rather than
against pocketpal. An invented requirement, faithfully implemented, still isn't the requirement.

The surface was subsequently corrected to pocketpal's shape — collapsed row plus sheet, a static
no-results row, and split query/count labels so a long query truncates while the count never does.

**The lesson generalises past this document:** every gap in the parity audit describes a
pocketpal behaviour, so a spec written from those descriptions inherits every gap in them. Read
the reference before writing the requirement, not after. The spec and the reference should be
cross-checked before an implementation is reviewed for spec compliance — a review cannot catch a
requirement that was never real.