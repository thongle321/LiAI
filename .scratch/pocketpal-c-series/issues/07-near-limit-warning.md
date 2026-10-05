# Warn before the context window is full, not after

**Gap:** C4
**Status:** ready-for-agent
**Blocked by:** 05-cached-token-accounting.md, 06-remote-caps-probe.md

Recovery is fully built (`ContextLadderSheet`, `setNCtx`, engine reload on `manager.ts:29-46`). The **warning** is post-hoc only: `chat.tsx:220-227` keys off `outcome.contextFull === true`, so it appears after a turn has already failed.

PocketPal warns at 80% (`WARNING_THRESHOLD = 0.8`, `bannerVariantResolver.ts:4`,
gate at `:91-97`).

Correction (parity fact-check, 2026-10-06 — line numbers re-verified directly
against the source): the original wording here — "warns at 80% … with a
256-token runway" — conflated two gates. The runway is PocketPal's **context-full
auto-clear** gate (`AUTOCLEAR_RUNWAY = 256`, `bannerVariantResolver.ts:7`, checked
at `:76-80`: `used >= nCtx - AUTOCLEAR_RUNWAY`), NOT part of the warning. LiAI's
full banner keys off the native per-turn flag with no runway (`local-engine.ts`,
`context_full || truncated`) — pre-existing G1 design.

Known band — **RESOLVED to raw (2026-10-06, "implement all" round):** the
original implementation compared the ROUNDED fill percent (trigger matched
the displayed meter, but could fire up to 0.5pp below PocketPal's raw
`ratio >= 0.8`). Implemented as agreed: `isNearLimit` now compares the raw
ratio — `promptTokens / windowSize >= 0.8` — while `fillPercent` keeps
rounding for display. Test `compares the RAW ratio — the rounded band must
not warn` pins 3276/4096 (79.98%, displays 80) as NOT warning.

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
