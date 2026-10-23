# 02: Transient failure taxonomy (408, SSL peer verification, error copy)

**What to build:**

Replace the flat-fail branch in the Android worker — `res.code != 200 && res.code != 206 → fail(record, "HTTP N", null)` (`DownloadWorker.kt:208-209`) — with the reference `respond()` taxonomy (`DownloadEngine.kt:246-248`, verified against the vendored source; audit row "HTTP status handling"):

- 408 joins the transient lane: same treatment as LiAI's 429/5xx (`DownloadWorker.kt:186-189`) — requeue with the row QUEUED and `Result.retry()`. (In-process retry with backoff arrives in ticket 04; the taxonomy lands first so 408 never flat-fails.)
- `400..499` → `Failed("Client error: N")`. 401/403 keep LiAI's richer auth copy and `errorCode` (`DownloadWorker.kt:181-182`) — that is a deliberate divergence working in LiAI's favor.
- Anything else → `Failed("Unexpected response: N")`.
- `SSLPeerUnverifiedException` must not fall into the generic `IOException` requeue (`DownloadWorker.kt:83`): it is a certificate-verification failure, not a network blip — fail the row with the failure message (reference `attempt()` 184-185: Stopped if the user stopped, else `End.Failed`).

Ship the ported tests first (MockWebServer: 408, 402, 404, 500, plus a MockWebServer TLS/SSL peer-unverified case) and let them go red before the change.

**Blocked by:** 01

**Status:** ready-for-agent

Acceptance:

- [ ] 408 requeues (row reads QUEUED) and WorkManager retries instead of failing flat "HTTP 408"
- [ ] 400..499 (non-401/403) fail with "Client error: N"; other codes fail with "Unexpected response: N"
- [ ] `SSLPeerUnverifiedException` fails the row with its message, never requeues silently
- [ ] 401/403 auth copy and `errorCode` unchanged (snapshot in the ported test)
- [ ] Ported suite green; `npm run typecheck` clean
