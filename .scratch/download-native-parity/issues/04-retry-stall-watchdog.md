# 04: In-process retry loop + stall watchdog + Room migration v1→v2

**What to build:**

Port the engine's attempt loop and stall accounting into the worker, keeping LiAI's QUEUED-requeue discipline (never `dao.fail` while the run can still be rescheduled — the deliberate divergence recorded in the audit):

- Room migration v1→v2, declared here first and reused by ticket 05: add the columns the ported semantics need (`stalledRuns`, response `etag`, `totalBytes`, `createdAt`) and the DAO surface the reference compiles against — `casStatus`, `writeProgress` (returns row count), `writeValidators`, `byDestination`, `endTransientRun` (reference `DownloadDao.kt:18,30,45,48,54`; LiAI `DownloadEntity.kt` is v1 with none of them).
- Port the attempt loop (`DownloadEngine.kt:131-156`): retry transient attempts in-process with exponential backoff 2 s → 30 s cap, sleeping in 250 ms stop-aware steps; reset backoff to the initial value whenever bytes advanced since the last failure.
- Port the stall watchdog (`104-114`): if no byte arrived for `GIVE_UP_AFTER_MS` (120 s) the run gives up; a run that wrote bytes resets `stalledRuns` to 0, one that wrote none increments it; at `MAX_STALLED_RUNS` (5) the row fails with `STALLED_ERROR = "Download stalled: no data received"`, otherwise it requeues QUEUED.
- Route 408/429/5xx and `IOException` through this loop as transients (replacing their WorkManager `Result.retry()` hops — WorkManager stays as the process-death backstop, not as the retry curve), per the reference 408/429/5xx → `Attempt.Transient` (`respond()` 246).
- Keep the `Restart` (remote-changed) semantics plumbed for ticket 03 (the single-Restart guard lives in this loop: `restarted` set → second Restart fails the row with `REMOTE_CHANGED_ERROR`).

Ship the ported tests first: engine-loop tests with an injected scheduler clock (transient backoff curve, reset-on-progress, give-up at 120 s, stalledRuns counting at 0..6 runs), a MockWebServer 408-then-200 success case, and the v1→v2 migration test.

**Blocked by:** 01

**Status:** ready-for-agent

Acceptance:

- [ ] v1→v2 migration adds stalledRuns/etag/totalBytes/createdAt; MigrationTestHelper covers v1→v2; DAO gains casStatus/writeProgress(int)/writeValidators/byDestination/endTransientRun
- [ ] Transient failures retry in-process with 2 s → 30 s backoff; backoff resets when bytes advance; 250 ms stop-aware sleep steps
- [ ] A 0-byte stall fails the row with "Download stalled: no data received" after runs 2..5 per the reference counting; ≤ 4 stalled runs requeue QUEUED
- [ ] No `dao.fail` on transient paths (QUEUED discipline preserved)
- [ ] Single-Restart guard exists and fails with "Remote file changed during download" (exercised fully by ticket 03)
- [ ] Ported engine migration/loop suites green; `npm run typecheck` clean
