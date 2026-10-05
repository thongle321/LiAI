# Warn before the context window is full, not after

**Gap:** C4
**Status:** ready-for-agent
**Blocked by:** 05-cached-token-accounting.md, 06-remote-caps-probe.md

Recovery is fully built (`ContextLadderSheet`, `setNCtx`, engine reload on `manager.ts:29-46`). The **warning** is post-hoc only: `chat.tsx:220-227` keys off `outcome.contextFull === true`, so it appears after a turn has already failed.

PocketPal warns at 80% (`bannerVariantResolver.ts:3`) with a 256-token runway.

## Acceptance

- A threshold warning appears while the thread is still usable, before a turn fails.
- Occupancy is the **corrected** figure from 05, not a separate calculation.
- Remote turns warn correctly, which requires the `n_ctx` from 06.
- The existing "More room" / "New chat" / Dismiss actions are reused — no second recovery surface.
- Dismissal stays per-turn, so the next near-limit turn warns again.
- An already-full thread still shows today's banner unchanged.

## Files

`components/chat/ContextFullBanner.tsx`, `chat.tsx`, `lib/chat/context-fill.ts`.

## Notes

Do not build this before 05 and 06 — a warning computed from a knowingly wrong number, or with no remote denominator, is worse than no warning. That is the entire reason for the blocking edges.
