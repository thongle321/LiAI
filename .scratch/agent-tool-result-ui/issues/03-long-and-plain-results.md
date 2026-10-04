# 03: Long and plain results read well

**What to build:** The remaining tool surfaces read at the right density. A page read can be 6,000
characters of extracted text and must not swamp the answer it led to; a calculation or a datetime
result should read as a number and a time, not as prose.

This ticket fills in the surfaces the web-search ticket left as generic, and makes an unregistered
tool degrade gracefully rather than vanish.

**Blocked by:** 01 — A failed tool call becomes visible (it owns the discriminant and the dispatch)

**Status:** ready-for-agent

- [ ] `read_url` renders its extracted text as a collapsible surface rather than inline prose.
- [ ] A truncated page read says it was truncated, so a cut-off article is not mistaken for the
      whole thing.
- [ ] `calculate` renders its result plainly, so it reads as a number.
- [ ] `datetime` renders its result plainly, so it reads as a time.
- [ ] A tool with no registered renderer still shows that it ran, rather than disappearing from the
      transcript.
- [ ] Adding a tool to the registry does not require any change to the chat screen.
- [ ] Collapse and expand reuse the same affordance the web-search surface introduced, so there is
      one control for the behaviour rather than two.
- [ ] A long result is collapsed by default and does not push the newest message out of view.
- [ ] Collapsed surfaces expose their summary — which tool ran, and how it ended — to a screen
      reader, so a collapsed transcript is still navigable.
- [ ] Every control meets the touch-target floor and carries an accessibility role, label and
      expanded/collapsed state.
- [ ] Surfaces do not intercept the bubble's long-press, so the message menu still opens on any
      turn that used a tool.
- [ ] Each talent's success shape is covered at the seam already used for the failure cases, so a
      renderer never has to guess which tool produced a given outcome.
- [ ] The one-control-for-collapse decision is pinned structurally, so a second divergent control
      cannot creep in beside the first.