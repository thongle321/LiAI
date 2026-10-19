# Can `expo-background-task` replace PocketPal's WorkManager downloader?

**Status of the package in `D:/aivision`: NOT INSTALLED.** `node_modules/expo-background-task` and
`node_modules/expo-task-manager` do not exist. This assessment is from official sources only
(docs.expo.dev, expo/expo `main`, developer.android.com). No files were edited.

## A. Platform support — Android works, and is not new

Android is supported and uses **WorkManager + `expo-task-manager`** (not HeadlessJS-from-scratch;
the JS body runs through Expo's task service):

> "This module uses the `WorkManager` API on Android and the `BGTaskScheduler` API on iOS to
> schedule tasks. It also uses the `expo-task-manager` Native API to run JavaScript tasks."
> — https://docs.expo.dev/versions/latest/sdk/background-task/

Mechanism, from source: `BackgroundTaskScheduler.scheduleWorker()` builds a
`OneTimeWorkRequestBuilder<BackgroundTaskWork>` with `setConstraints(setRequiredNetworkType(NetworkType.CONNECTED))`
— `packages/expo-background-task/android/.../BackgroundTaskScheduler.kt`. `BackgroundTaskWork.doWork()`
delegates to `BackgroundTaskScheduler.runTasks()` → `BackgroundTaskConsumer.executeTask()` →
`taskManagerUtils.executeTask(...)` (`.../BackgroundTaskWork.kt`, `.../BackgroundTaskConsumer.kt`).

Maturity: Android fixes appear from `0.1.4` (2025-04-02, Android proguard rules) onward, Expo Go
support in `0.2.1`, Android testing hook in `0.2.7`, and a typed config plugin in `56.0.0`. Current
recommended version is `~57.0.21`. So Android support is **established, not recent or partial**.

## B. Execution budget — this is where it fails

**Android.** A plain `Worker` is capped at 10 minutes. Longer requires `setForegroundAsync()` /
`setForeground()`, which runs the work in a foreground service with a notification:

> "These Workers can run longer than 10 minutes... Under the hood, WorkManager manages and runs a
> foreground service on your behalf to execute the `WorkRequest`, while also showing a configurable
> notification."
> — https://developer.android.com/develop/background-work/background-tasks/persistent/how-to/long-running

`BackgroundTaskWork.doWork()` **never calls `setForeground`/`setForegroundAsync`**, and
`expo-background-task` exposes no API to do so — the documented surface is only `getStatusAsync`,
`registerTaskAsync`, `unregisterTaskAsync`, `triggerTaskWorkerForTestingAsync`, plus iOS-only
`addExpirationListener`. **The 10-minute cap therefore applies.**

Worse, the task cannot even *start* on demand. The scheduler always sets:

```kotlin
builder.setInitialDelay(Duration.ofMinutes(overriddenIntervalMinutes))
```

with `DEFAULT_INTERVAL_MINUTES = 60L * 24L` (once a day) and a documented 15-minute floor:
> "Defaults to once every 12 hours (The minimum interval is 15 minutes)"
> — docs.expo.dev/versions/latest/sdk/background-task/ (`BackgroundTaskOptions`)

And in release builds it is skipped entirely if the app is foregrounded (`runTasks` returns early
when `inForeground`, `BackgroundTaskScheduler.kt`). Also, a **single** worker serves all tasks
(docs: "Expo Background Task uses a single worker on both platforms").

**iOS.** Expo states tasks "can run for minutes, but the system can interrupt the process at any
time", and the expiration listener fires on system interruption — docs, `addExpirationListener`.
The exact numeric BGAppRefreshTask/BGProcessingTask ceilings: **could not verify** —
developer.apple.com is JS-rendered, no browser binary is available in this environment, and the
archive fallback was unreachable.

**For a 4GB file on a slow link this is fatal**, independent of the cap: the task cannot start for
≥15 minutes, cannot be started on demand, and cannot be told to run as a foreground service.

## C. It cannot do the transfer

There is **no native transfer**. The task runs your JS, so the HTTP transfer would have to happen
inside that budget via `expo-file-system`/fetch. Whether a killed task leaves a resumable partial is
therefore entirely up to your JS writer — and note `BackgroundTaskWork.doWork()` returns
`Result.success()` unconditionally unless the task throws (`BackgroundTaskWork.kt`), so a
half-finished transfer is reported to WorkManager as a *success*.

## D. Feature verdicts

| # | Capability | Verdict | Anchor |
|---|---|---|---|
| 1 | Survives process death / rescheduled | **PARTIAL** | Docs: "If the system stops the app or the device reboots, background tasks will resume, and the app will be restarted." But it restarts ≥15 min later with all JS state gone; only the partial file on disk survives. |
| 2 | Waits for connectivity + OS exponential backoff | **PARTIAL → backoff NOT SUPPORTED** | `NetworkType.CONNECTED` ✅ (`BackgroundTaskScheduler.kt`). Backoff ❌ — `doWork()` never returns `Result.retry()`, so WorkManager never reschedules with backoff (`BackgroundTaskWork.kt`). |
| 3 | Range resume from real file length | **NOT SUPPORTED** | No file APIs, no input data, no resume token. Entirely yours to reimplement in JS. |
| 4 | State persisted outside JS, cold-start readable | **NOT SUPPORTED** | Only task *registration* is persisted. No per-download record, no Room equivalent. |
| 5 | Cold-start "what is running?" + re-attach observers | **NOT SUPPORTED** | No `getActiveDownloads`, no `setProgress`, no WorkInfo observer. Nothing to re-attach to. |

## E. Honest comparison

**(i) `expo-background-task` + `expo-task-manager`** — You get: WorkManager process-death
rescheduling, connectivity constraint, one dependency. You give up: on-demand start (≥15 min delay),
the 10-minute cap with no foreground-service escape, all five capabilities in row 3–5, and pause /
retry / cancel granularity. ~60 lines. It cannot replace the Kotlin.

**(ii) Hand-written WorkManager module** (PocketPal's approach) — You get: full parity, including
pause/resume/retry/cancel and cold-start re-attach. You give up: a maintained native surface and
the prebuild-time autolink. Cost is already known and measurable: `DownloadWorker.kt` (14.8 KB),
`DownloadModule.kt` (23.1 KB), `DownloadDao/Database/Entity.kt` (3 KB) ≈ **~640 lines of Kotlin**,
plus an Expo config plugin copying `plugins/withOptionalCameraHardware.js`.

**(iii) Leave as-is** — You get: resumable partials today, already working
(`reconcileInterrupted` at `store/models/downloads.ts:436`, `resumeInterruptedDownload` reading
`file.length()` at `:118-125`). You give up: unattended progress while the app is closed.

**Recommendation: (iii).** It already delivers resume-from-partial, which is the capability users
actually notice; (i) cannot beat it on anything, and (ii) is ~640 lines of Kotlin plus a native
module to maintain for a case that is currently an accepted limitation.

**Flips to (ii)** when (a) users report abandoning multi-GB downloads because they must leave the
app open, and (b) you accept owning a native module for the app's lifetime. Flip to (i) **never** for
this workload.

## F. The deciding caveat

`expo-background-task` is **not suitable for large file downloads at all**, and the docs say so
implicitly but unmistakably: "the task may not run immediately after it is scheduled, but it will
run at some point in the future if the system decides so"; "designed to run deferrable background
tasks in a way that optimizes battery and power consumption"; "Defaults to once every 12 hours (The
minimum interval is 15 minutes)"; "Expo Background Task uses a single worker on both platforms"; and
the Android guarantee is capped at the 10-minute non-foreground Worker budget because
`BackgroundTaskWork` never promotes itself.

It is a **short periodic sync task** API. Using it for a 4GB transfer would mean a task that cannot
be started on demand, cannot exceed 10 minutes, cannot report progress to native, cannot resume, and
reports a truncated download as success. A downloader built on it would be strictly worse than the
current foreground-plus-reconcile approach.