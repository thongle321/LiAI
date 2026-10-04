# 02: A web search shows its hits

**What to build:** After a web search, the user can see what was actually retrieved — a readable
list of results with titles, URLs and snippets — and tap one to open the page. Today the transcript
shows only a chip reading `web_search`, so the answer's citations have to be taken on trust.

Rendering resolves a surface per tool by name from a registry populated at module load, so a new
tool acquires its surface without the chat screen being touched. Dispatch order is: an error block,
otherwise the registered renderer for that tool, otherwise the "used X" chip.

**Blocked by:** 01 — A failed tool call becomes visible (it owns the discriminant and the dispatch)

**Status:** ready-for-agent

- [ ] Rendering resolves a renderer by tool name from a registry, and the chat screen is unchanged
      when a renderer is registered for a tool it has never seen.
- [ ] `web_search` renders its hits as a readable list: title, URL and snippet per hit.
- [ ] A hit can be opened by tapping it.
- [ ] The search query is shown alongside its results, so the user knows what was looked up.
- [ ] The result list is built from the structured hits the search layer already produces, not by
      parsing back the markdown the model reads. The model's markdown contract is untouched.
- [ ] A search returning no hits reads as a clear empty result, not as a failed search.
- [ ] The surface is collapsed to a summary by default so a multi-tool turn does not bury the
      answer, and expands inline within the bubble without losing the reading position.
- [ ] Collapsed state survives the app restarting, so reopening a conversation does not expand every
      surface at once.
- [ ] A tool with no registered renderer degrades to the "used X" chip rather than disappearing or
      throwing.
- [ ] A tool call whose outcome has not yet landed renders nothing, leaving the existing pending
      indicator to cover the in-flight window.
- [ ] The surface does not intercept the bubble's long-press, so the message menu still opens.
- [ ] Expanding and collapsing meet the touch-target floor and carry accessibility roles and
      expanded/collapsed state.
- [ ] A structural guard pins that the dispatch order holds — error first, then registered
      renderer, then chip — following the source-scanning convention this repository already uses
      for the menu ordering and the attach brackets.
- [ ] Each of the four dispatch cases is covered, including the not-yet-landed case.