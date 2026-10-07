# 09: User row delivery status

**What to build:** User message rows carry a delivery status that includes a failed state, so a message that failed to send is visibly marked instead of looking sent.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] A user row shows sending, sent and error states.
- [ ] A failed send is marked as an error on the row itself.
- [ ] Sending and sent rows keep their current appearance.
- [ ] The error state clears when the message is retried successfully.
