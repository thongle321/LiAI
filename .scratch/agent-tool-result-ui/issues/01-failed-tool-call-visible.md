# 01: A failed tool call becomes visible

**What to build:** When a tool the model called fails, the chat screen says so, naming the tool and
what went wrong — instead of the bubble looking exactly like a reply that simply changed its mind.
Today the talent seam returns a bare string for both outcomes, so `web_search: no results for "x"`
and `read_url: request failed` arrive as ordinary-looking text and the failure is invisible.

This ticket makes the success/error distinction exist at the talent seam, carries it through storage,
and draws a failed call differently from a successful one. A successful call keeps rendering exactly
as it does today.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Every talent returns a structured outcome carrying a success/error discriminant, the tool
      name, and its content. The existing "never throws" contract is unchanged: a talent failure
      becomes an error outcome, not an exception.
- [ ] The outcome kind survives a round trip through the session store, and is purely additive —
      no data migration, no change to the export format version.
- [ ] A conversation written before this change still loads and renders, treating an absent outcome
      kind as unknown rather than as success or failure.
- [ ] A failed tool call renders as a distinct error block that names the tool and shows its
      message. It is not styled as a result and is not styled as a chip.
- [ ] A successful tool call with no renderer yet renders exactly as it does today.
- [ ] The error block pairs a glyph and a word with its colour treatment, so state is never carried
      by colour alone.
- [ ] The error block is announced when it appears, and a collapsed outcome still exposes its
      summary to a screen reader.
- [ ] Every interactive control in the new surfaces meets the 48dp touch-target floor and carries an
      accessibility role and label.
- [ ] The error block does not intercept the bubble's long-press, so the message menu still opens.
- [ ] The talent seam's tests cover each talent's failure mode producing an error outcome and its
      happy path producing a success outcome. These extend the existing talent coverage rather than
      standing up a new seam.
- [ ] The persisted read shape is tested with and without the new field, matching the existing
      precedent for turn outcome flags.
- [ ] The four-way dispatch ordering is covered, so a regression cannot silently reintroduce an
      error rendered as a result.