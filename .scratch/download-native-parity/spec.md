# Download native parity: port the PocketPal download engine semantics into `modules/native-download`

Status: ready-for-agent

Feature slug: download-native-parity

## Problem statement

LiAI's Android download driver (`modules/native-download`) is a simplified port of PocketPal's native download stack. The parity audit (`docs/research/pocketpal-native-download-audit.md`, refreshed 2026-10-23 against the vendored `pocketpal-ai` source) pins the remaining gaps. In the reference these behaviors live in `DownloadEngine.kt` (in-process retry loop with validators, `.part` staging + atomic commit, adoption of interrupted transfers) and `DownloadScheduler.kt` (JobScheduler user-initiated job first, WorkManager fallback). In LiAI they are absent or approximated:

- Transient failures (408, SSL peer verification) flat-fail instead of retrying in-process (`DownloadWorker.kt:208-209`).
- There is no stall watchdog: a transfer that stops receiving bytes can hang forever on WorkManager's backoff curve alone.
- A 206 response is trusted without validating `Content-Range` against the request offset (splice hole: new bytes appended onto an old partial after the remote file changed).
- Bytes are written straight to the final path (`RandomAccessFile(dest, "rw")`, `DownloadWorker.kt:238`), so "is this partial?" decisions across the JS side (`onDiskBytes`, `classifyFileOnDisk`, `reconcileInterrupted`) cannot distinguish a finished download from an interrupted one, and a completed file can be observed mid-write.
- WorkManager only: no user-initiated JobScheduler job on API 34+, so the ten-minute WorkManager cap is only survived by the foreground service, not by scheduler policy.

The conclusion of the 2026-10-23 parity review was "Port all": every gap becomes a ticket, including the previously declined `.part` design (that decline is recorded as REVERSED in the audit).

## Solution

Port the engine semantics row by row from the vendored reference, ordered so each ticket lands on top of the previous one's schema and test harness:

1. Native test harness (JUnit + Robolectric + MockWebServer + room-testing) and the reference test files it can host.
2. Transient taxonomy: 408/SSL semantics like the reference `attempt()`.
3. 206 `Content-Range` validation + the single-Restart rule that fails with `REMOTE_CHANGED_ERROR`.
4. In-process retry loop + stall watchdog (backoff 2 s → 30 s reset on progress, 120 s give-up, `stalledRuns` counting, max 5 stalled runs) — keeping LiAI's QUEUED-requeue discipline instead of the reference's WM-owned backoff where LiAI deliberately diverged.
5. `.part` staging + atomic `commit()` rename + `adopt()`, plus the JS resume-path learning that must follow it.
6. JobScheduler user-initiated port with graceful WorkManager fallback.

The Room schema grows in one shared migration (v1 → v2) owned by ticket 04 (declared first there, reused by ticket 05).

## User stories

- As a user on a flaky connection, my download recovers from a read timeout or a 408 by itself instead of showing "HTTP 408".
- As a user whose network dies mid-download, the transfer reports "stalled" and fails honestly instead of hanging at 0% forever.
- As a user resuming after the remote file changed, I get a clear "Remote file changed during download" error instead of a corrupt splice that passes the size check.
- As a user who kills the app mid-download, my partial file is adopted cleanly on the next start — never mistaken for a finished model.
- As a user on Android 14+, my multi-GB download keeps running under scheduler policy (user-initiated job) rather than only the foreground-service workaround.

## Scope

- Touches: `modules/native-download/android/**` (Kotlin + build.gradle), Room schema + migration, and for ticket 05 the JS resume seams (`store/models/downloads.ts`, `services/models/resume-state.ts`, `services/downloads/download-service.ts` win the `.part` awareness).
- Every ticket ships its ported native test first (red) then the port (green) — ticket 01 builds the harness that makes that possible.

## Non-goals

- iOS: unchanged (the reference gives iOS nothing beyond RNFS; already recorded as a deliberate divergence).
- ENOSPC retry loop and sha256 verification: remain known gaps (audit), not ported in this feature.
- JS-side stall watchdog: superseded by the native port (ticket 04).
- Changing the 401/403 auth copy or the JS error taxonomy except where a ported native error string flows through `nativeStateToJobStatus`.

## Verification

- Each ticket: its ported JUnit/Robolectric/MockWebServer suite green under `gradlew :modules:native-download:test` (or the module's test task), plus `npm run typecheck` and `npm test` green where JS seams changed.
- Kotlin stays unreachable from `npm test` (AGENTS.md): until the ported suites run, native changes are unverified — the harness ticket exists to close exactly that.
- Last mile (manual, after ticket 06): side-load the dev build; start a download; cut Wi-Fi mid-transfer; kill the process mid-transfer; verify stalled-failure, resume adoption, and `.part` invisibility from the models screen.
