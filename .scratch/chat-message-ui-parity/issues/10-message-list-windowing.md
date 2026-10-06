# 10: Message list render windowing

**What to build:** The message list is given explicit render windowing so a long conversation opens and scrolls without mounting every row at once.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The message list sets an explicit initial render count and a per-batch render cap.
- [ ] Scrolling a long conversation still reaches every message.
- [ ] Streaming a new reply is not visibly delayed by the windowing settings.
- [ ] Deferred ledger item 14 in the audit is marked closed.
