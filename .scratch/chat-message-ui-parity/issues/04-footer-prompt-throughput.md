# 04: Footer shows prompt throughput

**What to build:** The turn footer adds a prompt tokens per second reading alongside the time-to-first-token, generation rate and per-token cost it already shows, and shows it only when the engine reports it.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The footer shows prompt tokens per second when the engine reports it.
- [ ] The segment is omitted entirely when the engine does not report it, rather than printed as zero or NaN.
- [ ] Non-finite values are dropped rather than rendered.
- [ ] The new segment is formatted to two decimals, matching the existing generation-rate metric.
- [ ] A cached-token count is **not** added. The existing decision to treat the engine's cached-token figure as authoritative stands, and upstream's wire formula is deliberately not ported.
