# Yield the JS thread so Stop responds mid-stream

**Gap:** C16
**Status:** ready-for-agent
**Blocked by:** none

PocketPal yields a macrotask every 100ms during streaming (`useChatSession.ts:722`) so touch events — notably Stop — dispatch during long streams. Confirmed absent in LiAI.

## Acceptance

- A periodic yield runs while a turn is streaming.
- The yield does **not** fire when idle.
- No visible effect on output ordering, token coalescing, or the blank-space animation.
- Stop responds while tokens are still arriving.

## Files

`store/chat/send.ts` or `lib/chat/turn.ts` — one place, at the streaming loop.

## Notes

Small, but it is a responsiveness fix that cannot be verified by a source-scan. This is the ticket most likely to need real device confirmation. Prefer the same interval PocketPal uses rather than inventing one.
