# 03: 206 Content-Range validation + 416 semantics

**What to build:**

Stop trusting a 206 the way the worker does today (`DownloadWorker.kt:216` treats `206 && existing>0` as straight append; `serverTotal` math at :224-235 is built on an unvalidated response). Port the reference `respond()` 206/416 branches (`DownloadEngine.kt:221-244`, regexes at 362-363):

- Parse `Content-Range` with `Regex("bytes (\\d+)-(\\d+)/(\\d+|\\*)")`; an unparseable/missing header on a 206 → `Attempt.Restart`.
- A 206 is valid only if `rangeStart == requestOffset` AND (row `totalBytes <= 0 || rangeTotal == totalBytes`) AND (row etag or response etag is `null` → pass; both present → must be equal). Invalid → `Attempt.Restart` — which, through ticket 04's single-Restart guard, lands as `Failed("Remote file changed during download")` after one restart.
- Adopt validators the reference way (`231-235`): when the row lacks etag/totalBytes, write the response's via `writeValidators(id, etag, total, offset)`.
- Port the 416 branch (`238-244`): parse `Regex("bytes \\*/(\\d+)")` (`UNSATISFIED_RANGE`); it is a completed download iff `offset > 0` AND (row `totalBytes > 0 ? offset == totalBytes : headerTotal == offset`) → `totalBytes = offset`, Completed; otherwise `Attempt.Restart`.

Use the validator columns and `writeValidators` from ticket 04's migration. `If-Range` stays quoted (LiAI already correct, `DownloadWorker.kt` request build) and references the stored etag.

Ship the ported tests first (MockWebServer): matching 206 appends; 206 with wrong start / mismatched total / mismatched etag / malformed header restarts and then fails "Remote file changed during download"; 416 with `offset == total` completes; 416 otherwise restarts; missing-validators adoption persists.

**Blocked by:** 01, 04 (needs the validator columns + writeValidators + single-Restart guard)

**Status:** ready-for-agent

Acceptance:

- [ ] Valid 206 appends from the request offset; validators persisted via writeValidators
- [ ] Mismatched start/total/etag and malformed Content-Range trigger exactly one restart, then FAIL with "Remote file changed during download"
- [ ] 416 completes when the offset equals the known total; otherwise restarts
- [ ] Chunked Content-Length no longer mistaken for a remainder (audit note at `DownloadWorker.kt:221` resolved by the rework)
- [ ] Ported suite green; `npm run typecheck` clean
