# 03: Stopping state and live tool-call token count

**What to build:** Two additions to the pending row. While a stopped turn is unwinding, the row reads "Stopping…" and shows nothing else. While a tool call is being generated, a live count of the tokens generated for that call appears once it reaches ten — "Building page · 120 tokens · 4s".

**This ticket deliberately reverses two decisions currently written down in the pending indicator**, which argue that showing a mid-turn token count would be a confident-looking lie, and that holding the in-flight state through teardown would block the user from sending. Porting parity means accepting the upstream trade-offs instead. Both reversals are intentional; note them in the component's comment so the next reader does not re-litigate them a third time.

**Blocked by:** 02 — Pending row names the phase the model is in

**Status:** ready-for-agent

- [ ] Pressing Stop during a tool call shows "Stopping…" in place of the label, the token count and the elapsed seconds.
- [ ] The row clears when the turn finishes unwinding, whether it succeeded or failed.
- [ ] The user can send a new message once teardown completes; the unwinding state does not wedge the composer.
- [ ] A tool call that has generated ten or more tokens shows "N tokens" with locale separators; below ten it is hidden.
- [ ] The count resets at the start of each tool call and at the start of each turn.
- [ ] The count reflects tool-call fragments only, never streamed reply text.
- [ ] The label, token count and elapsed seconds are joined with a middle dot in that order.
