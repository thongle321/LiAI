# 05: The remaining context banner variants

**What to build:** Three more banner states join the existing fill warning and context-full banner: an escalation after repeated context-full turns, a "this reply may have been cut off" notice for a remote reply that stops without terminal punctuation, and a soft-cap notice once several HTML previews have accumulated. The context-full banner also learns to name the tool that needs the most room.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] After two consecutive context-full turns the full banner escalates to the "still out of room" wording; any successful turn resets the counter.
- [ ] A remote reply of at least five hundred tokens that does not end in terminal punctuation shows the cut-off notice; one that ends in a full stop does not.
- [ ] Four or more HTML previews in the conversation shows the soft-cap notice, and fewer shows nothing. This notice appears with no model loaded.
- [ ] The context-full banner names the tool that consumes the most context when the turn's last tool declares a context cost.
- [ ] For a remote turn the remote wording wins over the local variants regardless of failure count or tool.
- [ ] Each banner can be dismissed and stays dismissed until the next recorded turn.
- [ ] All variants mount in the same single slot as the existing banners, not inside the message list.
