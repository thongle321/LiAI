# 02: Transient failure taxonomy (408, SSL peer verification, error copy)

**What to build:**

Replace the flat-fail branch in the Android worker — `res.code != 200 && res.code != 206 → fail(record, "HTTP N", null)` (`DownloadWorker.kt:208-209`) — with the reference `respond()` taxonomy (`DownloadEngine.kt:246-248`, verified against the vendored source; audit row "HTTP status handling"):

- 408 joins the transient lane: same treatment as LiAI's 429/5xx (`DownloadWorker.kt:186-189`) — requeue with the row QUEUED and `Result.retry()`. (In-process retry with backoff arrives in ticket 04; the taxonomy lands first so 408 never flat-fails.)
- `400..499` → `Failed("Client error: N")`. 401/403 keep LiAI's richer auth copy and `errorCode` (`DownloadWorker.kt:181-182`) — that is a deliberate divergence working in LiAI's favor.
- Anything else → `Failed("Unexpected response: N")`.
- `SSLPeerUnverifiedException` must not fall into the generic `IOException` requeue (`DownloadWorker.kt:83`): it is a certificate-verification failure, not a network blip — fail the row with the failure message (reference `attempt()` 184-185: Stopped if the user stopped, else `End.Failed`).

Ship the ported tests first (MockWebServer: 408, 402, 404, 500, plus a MockWebServer TLS/SSL peer-unverified case) and let them go red before the change.

**Blocked by:** 01

**Status:** resolved

Acceptance:

- [x] 408 requeues (row reads QUEUED) and WorkManager retries instead of failing flat "HTTP 408"
- [x] 400..499 (non-401/403) fail with "Client error: N"; other codes fail with "Unexpected response: N"
- [x] `SSLPeerUnverifiedException` fails the row with its message, never requeues silently
- [x] 401/403 auth copy and `errorCode` unchanged (snapshot in the ported test)
- [x] Ported suite green; `npm run typecheck` clean

## Resolution

- TDD verified red→green: the red run produced exactly the predicted split (17 tests, 4 failed — 408/402/404/302 all landing flat-failed `"HTTP N"`; 500/401/403/200 and the ticket-01 suites green), then the fix turned the suite fully green. Final: **18 tests, 0 failures** (DownloadDaoTest 8 + DownloadMigrationTest 1 + DownloadWorkerTest 9). Invocation: `.\gradlew.bat :native-download:testDebugUnitTest`.
- `DownloadWorker.kt` transfer() `when{}` restructured in reference order: 401/403 (auth copy kept) → 408|429|500..599 (transient requeue; 408 added) → 416 (delete + "tap Retry") → 400..499 → `Failed("Client error: N")` → else → `Failed("Unexpected response: N")`.
- `DownloadWorker.kt` doWork() catch chain: `SSLPeerUnverifiedException` caught BEFORE `IOException` (which it extends) → row FAILED with the TLS message + `Result.failure()`; never requeued.
- Injectable client seam (deferred from ticket 01): `DownloadWorker(context, params, client: OkHttpClient = OkHttpClient())` with the exact 2-arg secondary constructor kept for WorkManager's reflective default WorkerFactory (production behavior unchanged).
- Test-only detail worth keeping: OkHttp's default client transparently re-runs a 408 response (RetryAndFollowUpInterceptor) and would consume more queued MockWebServer responses — the 408 test injects a `retryOnConnectionFailure(false)` client; the SSL test injects the reference's interceptor idiom (client whose interceptor throws `SSLPeerUnverifiedException` mid-"handshake", DownloadEngineTest.kt pattern).
- Files: `modules/native-download/android/src/main/java/com/anonymous/liai/download/DownloadWorker.kt`, `src/test/java/com/anonymous/liai/download/DownloadWorkerTest.kt` (new, 9 tests). JS surface untouched; `npm run typecheck` clean.
- Deliberate divergences recorded at code review: (a) the SSL catch has no `isStopped` check like the reference `attempt()` — in LiAI the user-stop path is owned by the `CancellationException` catch/rethrow, so a stop racing the TLS failure surfaces there instead; (b) messageless `SSLPeerUnverifiedException` falls back to `"TLS peer not verified"` (reference `DownloadEngine.kt:185` does the same), keeping the row's error non-null.
