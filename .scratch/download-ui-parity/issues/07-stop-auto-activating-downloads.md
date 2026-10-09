# 07: Stop auto-activating a downloaded model

**What to build:** A completed download marks the model downloaded and does
nothing else. The user taps Load to activate it. The reference app never
auto-activates either.

The cost is explicit and accepted: a first-time user who downloads their only
model lands on a chat with no model selected. The information is still there —
the card flips to a downloaded state with a Load control — but this is the change
most likely to draw a bug report, so it ships on its own.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] A completed download leaves the model in a downloaded state and does not select it
- [ ] The model appears under Ready to use with a Load control, so activation stays discoverable where the user expects it
- [ ] No code path selects a model as a side effect of download completion
- [ ] The behaviour is guarded by a source assertion that no auto-activation remains
- [ ] The empty-chat state remains coherent now that nothing is ever auto-selected
