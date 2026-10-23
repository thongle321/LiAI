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

**Status:** resolved

Acceptance:

- [x] Valid 206 appends from the request offset; validators persisted via writeValidators
- [x] Mismatched start/total/etag and malformed Content-Range trigger exactly one restart, then FAIL with "Remote file changed during download"
- [x] 416 completes when the offset equals the known total; otherwise restarts
- [x] Chunked Content-Length no longer mistaken for a remainder (audit note at `DownloadWorker.kt:221` resolved by the rework)
- [x] Ported suite green; `npm run typecheck` clean

## Resolution

- TDD red→green confirmed: red run = 44 tests, 8 failed (exactly the new ticket-03 cases against the pre-change worker), then all green after the worker rework. Final suite: **44 tests, 0 failures** (DownloadDaoTest 16 + DownloadEngineTest 10 + DownloadMigrationTest 1 + DownloadWorkerTest 17). Invocation: `.\gradlew.bat :native-download:testDebugUnitTest`. `npm run typecheck` clean.
- `DownloadWorkerTest.kt` gains `seedPartial(partialSize, adjust)` + `continuation(contentRange, etag, bodySize, chunked)` helpers and 8 tests (`// --- 206 Content-Range validation / 416 resolve (ticket 03) ---`): valid 206 appends + persists etag/totalBytes via writeValidators; wrong start / mismatched total / mismatched etag / malformed-or-missing Content-Range each restart exactly once into `Failed("Remote file changed during download")` (requestCount == 2, destination deleted, validators cleared); 416 `"bytes */1000"` with a complete part completes (COMPLETED, totalBytes 1000); 416 under total restarts; chunked `bytes 400-999/*` adopts the etag and completes without trusting Content-Length.
- `DownloadWorker.kt`: oversize guard `>=` → `>` (a part whose size EQUALS expectedTotal is legitimate now — If-Range + range validation keep its contents honest); local `restart()` deletes the part and clears downloadedBytes/etag/totalBytes, returning `Attempt.Restart` (single-Restart guard decides); `If-Range` sent for `record.etag ?: record.ifRange` (stored etag is the validator of the bytes on disk); 206 validated against `CONTENT_RANGE` (start == existing, rangeTotal vs row totalBytes, strong-ETag equality) with `writeValidators` adoption when either validator was missing (`rangeTotal` keeps `*` as null); 416 resolved via `UNSATISFIED_RANGE` headerTotal — complete → COMPLETED row with `totalBytes` adopted + `Attempt.Finished`, else restart(); `serverTotal` prefers the validated `rangeTotal`, then Content-Length math, then row totalBytes, then catalog expectedTotal — chunked responses no longer inherit expectedTotal as a remainder.
- Deliberate divergence recorded: the reference maps a restart-exhausted run through `dao.fail(REMOTE_CHANGED_ERROR)`; LiAI's engine `End.Failed` reaches `doWork` without any lane having failed the row, so `run()` writes it with a RUNNING-guarded `casStatus(..., FAILED, end.message)` — a no-op when a lane already failed the row with richer copy (e.g. 401/403 auth errorCode preserved).
- Files: `modules/native-download/android/src/main/java/com/anonymous/liai/download/DownloadWorker.kt`, `src/test/java/com/anonymous/liai/download/DownloadWorkerTest.kt`.

