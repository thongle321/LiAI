# PocketPal native download module — audit and parity verdict

Date: 2026-10-08 (updated 2026-10 by `download-ui-parity`; re-verified against the
vendored source 2026-10-23 by `download-native-parity`)
Scope: `pocketpal-ai/src/services/downloads/DownloadManager.ts` (+ its spec) +
`pocketpal-ai/android/app/src/main/java/com/pocketpalai/download/`
vs `modules/native-download/`, `services/downloads/download-service.ts`,
`services/downloads/android-download-service.ts`, `store/models/downloads.ts`.

Since the 2026-10 update the document also covers the download *UI*, not only
the native module — see "Deliberate differences in the download UI, and what
each one costs". **As of 2026-10-23 `pocketpal-ai/` IS vendored in this
worktree and read-only** (per the repo's PocketPal-parity rule), so the engine
rows below were re-verified against its Kotlin source; see "Reference engine
internals (verified against the vendored source)" for the row-level evidence
the `download-native-parity` tickets rest on. Paths in rows written before the
2026-10 store/services reorganization have been updated to the current layout
(`lib/…` became `services/…` and `utils/…`).

Native-module gaps and open calls in this document are tracked as tickets
under `.scratch/download-native-parity/` (see that spec for the port-all
decision).

## What PocketPal's module is

A plain RN **TurboModule + codegen** (`codegenConfig` → `PocketPalSpecs`,
`javaPackageName com.pocketpal.specs`, registered as `'DownloadModule'`).
Android only — there is no Swift download module; iOS is driven from JS
through `@dr.pogodin/react-native-fs`.

| Concern | Implementation |
|---|---|
| Transfer | WorkManager `CoroutineWorker` + OkHttp, `enqueueUniqueWork(..., REPLACE, ...)` |
| Durability | Room `DownloadDatabase` (v2, with a 1→2 migration) as the job table |
| Resume | `Range: bytes=${file.length()}-`; server-ignores-Range → delete and restart; 416 → delete + FAILED |
| Retry | WorkManager `BackoffPolicy.EXPONENTIAL` + `NetworkType.CONNECTED`; `Result.retry()` on 5xx |
| Progress | Room write throttled to 1 Hz, `LiveData` observer → JS events |
| Cancellation | DB status CANCELLED, delete partial, `cancelUniqueWork().result.await()`, `pruneWork()` |

Spec surface (`NativeDownloadModule.ts:26-49`) exposes 9 verbs. **Only 4 are
ever called from JS**: `startDownload`, `cancelDownload`, `getActiveDownloads`,
`reattachDownloadObserver`. `pauseDownload`, `resumeDownload`, `retryDownload`
and `logDownloadDatabase` are implemented in Kotlin and **dead from JS**.

Events: `onDownloadProgress`, `onDownloadComplete`, `onDownloadFailed`,
`onDownloadCancelled`. The last is emitted natively and **never handled in JS**.

## What it replaces

It replaces what would otherwise be a JS-owned transfer: with no module, the
app must hold the transfer in the app process, where it dies with the process.
PocketPal's JS side is thin — `src/services/downloads/DownloadManager.ts:489`
calls `startDownload` and otherwise only re-syncs via `getActiveDownloads()`
at boot (`ModelStore.ts:763`).

The manual JS implementation it displaces is visible in PocketPal's own iOS
path (`DownloadManager.ts:325-341`): `RNFS.downloadFile` with a
`progressInterval`, which is what the module exists to make unnecessary.

## Verdict: row-by-row parity

`same` = behaves as the reference. `better` = diverges in LiAI's favour
(kept deliberately). `documented` = contract/architecture difference with no
behavioral consequence, kept on purpose.

| Row | PocketPal | LiAI | Verdict |
|---|---|---|---|
| Framework | TurboModule + codegen, `getEnforcing` | Expo Modules API, `requireNativeModule` | documented |
| Registered name | `DownloadModule` | `NativeDownload` | documented |
| Missing native side | `getEnforcing` throws | caught → `null` → legacy driver fallback | better |
| `startDownload` shape | `(url, config)`, native generates the id | `(request)` with caller `id` + `modelId` | better — joins to model cards exactly, where PocketPal matches `download.url === m.downloadUrl` and breaks on redirect |
| Return types | `Promise<boolean>` (return = did it work) | `Promise<void>`, the Room store is the authority | documented |
| Events | 4 named events; `onDownloadCancelled` emitted, never handled | 1 `onDownloadEvent` carrying the whole record; **terminal states emitted from the live loop**, re-attach replay stays filtered (`NativeDownloadModule.kt:206`) | same behavior, documented shape |
| Record fields | `{url, destination, progress, status}` | `{modelId, fileName, expectedTotal, downloadedBytes, errorCode, …}` | better |
| Transfer / durability | WorkManager + Room | WorkManager + Room | same |
| Resume safety | `Range` from file length **plus validators**: `If-Range` (strong ETag only, `DownloadEngine.kt:318-319`), a 206 must match `Content-Range` start/total/etag or the transfer restarts (`DownloadEngine.kt:221-236`); `adopt()` reconciles the file on disk with the row (`DownloadEngine.kt:158-176`) | `Range` + quoted `If-Range` + oversize-partial guard; **no 206 `Content-Range` validation** (trusts the response's declared range), no in-place/partial adoption | better on If-Range; **behind** on 206 validation and adoption — ported as tickets 03/04 |
| HTTP status handling | in-process `Attempt.Transient`/`Restart` engine: 408/429/5xx → transient with backoff, 400..499 → `Client error: N`, else `Unexpected response: N` (`DownloadEngine.kt:246-248`); transient ends re-schedule the run QUEUED | 429 + 5xx requeue (row = QUEUED) + WorkManager `Result.retry()`; 401/403 auth-specific copy; **408 and every other non-200/206 fail flat "HTTP N"** (`DownloadWorker.kt:208-209`) | better on 401/403/429/5xx; behind on 408-transient — ported as ticket 02 |
| Total size source | response `Content-Length` (`PW:176-194`); iOS takes raw `contentLength` with no 206 correction | response total, `206 → existing + contentLength`, chunked `-1` falls back to catalog (`DownloadWorker.kt` transfer); legacy driver guards expo's `-1 + N` (`download-service.ts` handleProgress) | same on Android, better on iOS |
| Size-mismatch check | none visible — total just follows the response | compares disk against the adopted server total, catalog when the server reported none | same, plus a check |
| Progress cadence | Room write at 1 Hz + LiveData events | Room write at 1 Hz + events, single writer | same |
| Terminal delivery | immediate events | immediate events, deduped by `claimTerminal` (`lib/models/download-jobs.ts`) | same |
| 10-minute cap | API 34+ runs a **JobScheduler user-initiated job first** (`setUserInitiated(true)`, `DownloadScheduler.kt:109-119`), falling back to WorkManager — neither carries WorkManager's 10-minute background cap the way an ordinary `CoroutineWorker` does | foreground service + notification, `FOREGROUND_SERVICE_TYPE_DATA_SYNC` + WorkManager only | better (determinate progress); same cap-lifting territory, two mechanisms — the UI overlap is noted, not migrated |
| Notification progress | none at all | determinate bar re-emitted on every 1 Hz write; spinner only when total unknown | better |
| `POST_NOTIFICATIONS` request | before every download — `ensureNotificationPermission()` is awaited inside `startAndroidDownload` (`pocketpal-ai/src/utils/androidPermission.ts:58`, called from `DownloadManager.ts:483-500`); prompts once per session, API 34+ only | never requested — removed (2026-10-09) | worse: on Android 13+ the worker's foreground-service notification stays suppressed unless the user grants the permission from system settings (source-verified 2026-10-23; previously rested on the spec) |
| Paused row at worker entry | `Result.retry()` — burns backoff cycles | `Result.success()`, bytes kept | better |
| pause / resume / retry from JS | 4 of 9 verbs dead from JS | all 7 verbs called | better |
| Room row lifecycle | rows grow forever | `forgetDownload` on `removeJob` | better |
| Re-adopt after JS death | `reattachDownloadObserver` re-attaches LiveData; `syncWithActiveDownloads` (`ModelStore.ts:763`) adopts at boot | `reconcileWithNative` reads `getActiveDownloads` once at boot + `claimTerminal` | same behavior, different mechanism |
| Disk classification on cold start | JS-less; worker reconciles file vs DB | worker reconciles, and `reconcileInterrupted` **skips** specs the native store knows (`knownModelIds`) | same, ordering documented |
| Auth token at rest | plaintext `authToken` Room column (v1→v2 migration) | plaintext `headers` JSON in Room; source is SecureStore | same exposure |
| Free space | JS pre-flight only | JS pre-flight (fail-closed, `modelFitsOnDevice`) + a 15 s live poll on every card with a Download button (`useFreeSpacePoll`) + the legacy driver's own 10 s watch | better in coverage; see divergence D2 for the fail-closed cost and D8 for the interval |
| `progressInterval` / `networkType` / `priority` config | present in spec; `networkType`/`priority` never read by its own worker | hardcoded equivalent values | documented — same observable behavior |

## Deliberate non-divergences

These were raised as candidate improvements and **declined**, because
matching PocketPal is the better answer for each:

1. ~~**No `.part` temp file + atomic rename.**~~ **REVERSED 2026-10-23 — port
   approved** by the `download-native-parity` "port all" decision, as ticket
   05 (`.part` + `commit()` atomic rename + `adopt()`). This row is kept only
   so the reversal is visible. The original decline stands as written below,
   because it is the exact risk ticket 05 must engineer around: both apps
   wrote straight to the final `.gguf` and recovered correctness by size, not
   by atomicity, and `reconcileInterrupted` (`downloads.ts:453`) and
   `onDiskBytes():118` stat the **final** path — so the ticket also teaches
   the JS resume paths to see a `.part` file as the partial it is.
2. **No sha256 / checksum.** Neither app hashes. `file.oid`
   (`types/models.ts:21`) is the LFS sha256 and is already on every record, so
   verification is cheap to add later — but a 4 GB on-device hash is a real
   CPU and battery cost, and `classifyFileOnDisk` already rejects short and
   overshoot files. Only a same-length corrupt file passes, and it fails at
   load rather than silently.
3. **No `StatFs` in the Android worker.** PocketPal has none either; its free
   space check is JS-side and so is LiAI's.
4. **iOS gets neither the native guarantees nor sha256.** Android is where the
   process is actually killed, so that is where the durability work pays.

## Deliberate divergences from PocketPal

Ported to match the reference exactly; these are the places it does not.

1. **The global download banner is deleted.** PocketPal mounts
   `DownloadOverlay` above the app switch point with a `+N` badge, a Stop
   pill and a per-model dismiss, kept alive by a MobX `reaction`. LiAI's
   `DownloadBanner` had none of the last two and is gone entirely, so
   progress lives on the models screen only. Cost, stated plainly: a
   download started anywhere is invisible off `/models`, and cancelling it
   means navigating back. Kept: `MessageInput.tsx`'s `"Loading model…"`
   composer placeholder and `ChatEmptyPlaceholder.tsx`'s `"<name> is getting
   ready"` — both at parity, and now the only cross-screen signal.
   Side effect: the banner consumed `insets.top` while every drawer screen
   padded it again, so deleting it removed an app-wide double inset.
2. **The rate is sampled through one window**, `nextSpeedSample`
   (`services/models/download-jobs.ts`); the formula is the reference's exactly
   (delta bytes over delta seconds, remaining over speed,
   `DownloadManager.ts:88-120`). The window exists because the Room Flow
   re-emits on *any* row write, so a status transition delivers a record
   whose byte count has not moved — raw per-tick math reads that as a hard
   `0 MB/s`, which is the `0 -> value -> 0` flicker. Duplicates keep the
   window open instead; the reference has no such case because its own
   LiveData observer feeds it the same way.
3. **`formatBytes` is decimal base 1000 with `kB`**, ported verbatim from
   `utils/formatters.ts:16-41`. It replaced a binary `KB` implementation, so
   every byte string in the app shifted.
4. ~~**Mixed unit bases are inherited, not fixed.**~~ **Reversed
   2026-10 — see D5.** This row is kept only so the reversal is visible.
   `progressCaption` now divides the speed by 1000 as well, so the byte
   figure and the speed figure on one line agree. The worked example that
   used to read `1.05 MB (5.42 MB/s)` is pinned by `tests/progress.test.ts`
   so the divisor cannot drift back. The one unit mismatch that remains
   deliberately is the absent hours branch, which is D6.
5. **No hours branch.** A 3 GB model at 3 MB/s renders `1000 min`, exactly
   as PocketPal does. Kept on purpose — recorded again as D6 with its cost.
6. **The dead `activeDownloads` store map is deleted.** It was write-only in
   LiAI too; the reference has no equivalent map at all.

## Deliberate differences in the download UI, and what each one costs

Written 2026-10 by the `download-ui-parity` feature (spec at
`.scratch/download-ui-parity/spec.md`, tickets 01–07, commits `6ddc3a4` …
`bb4ec9c`). Everything above this line is about the *native module*. This
section is about the experience around it, where LiAI knowingly differs from
the reference app.

**Read this section before "fixing" any of it.** Every row is a decision with
a stated cost. A reader who finds one of these and cannot find the cost has
found a bug in this document, not a bug in the app.

`pocketpal-ai/` **was not vendored when this section was written** (2026-10 by
`download-ui-parity`), so the reference side of each row below rests on the
spec and on the research recorded earlier in this document. It **is vendored
now** (read-only), so anything in these rows can be re-checked against
`pocketpal-ai/src/` when a change here is proposed; where a row has already
been re-verified against the source it says so.

| # | Divergence | Why | Cost |
|---|---|---|---|
| D1 | The global download banner / overlay stays deleted. No `DownloadBanner`, no `DownloadOverlay`, no floating badge, no cross-screen download indicator anywhere in `app/` or `components/`. | Decided twice before this feature and again in it. The reference mounts an overlay above the app switch point with a `+N` badge, a Stop pill and a per-model dismiss; downloads are visible on `/models` only. | **A download started anywhere is invisible off `/models`, and cancelling it means navigating back to `/models` first.** The composer placeholder ("Loading model…") and the chat empty placeholder ("<name> is getting ready") are the only cross-screen signal. Secondary: deleting it removed an app-wide double top inset, so that is a benefit, not a cost. |
| D2 | The storage pre-flight **fails closed**. Unreadable or non-finite free space blocks the download (`utils/storage-fit.ts:modelFitsOnDevice`). This is a reversal of our own earlier policy, which failed open with "unknown free space must never disable a download button". | Matches the reference. A transfer that runs out reports its own failure honestly; a permanently disabled button explains nothing. | **A device whose free-space read always throws can never start any download, permanently.** That is the single most likely line here to need revisiting. The reversal is one line — treat `freeBytes === null` as a fit — and the reasoning is in the header of `utils/storage-fit.ts`. The card surfaces additionally *say* so ("Couldn't read storage — download needs a free-space check") rather than greying out silently. |
| D3 | **No auto-activation of a completed download.** The `setActiveModel` call that used to sit in the downloads store's completion path is gone, so no path — main leg, vision-projector leg, or cold-start adoption of a transfer that outlived the JS runtime — selects a model as a side effect of a download finishing. Activation is an explicit **Load** under "Ready to use". | The reference never auto-loads. | **A first-time user who downloads their only model lands on an empty chat with nothing selected and must tap Load.** The card does flip to Downloaded with a Load control, and the empty-chat copy was corrected to stop promising self-activation, but the contrast with the previous behaviour is stark and will read to a user as "I downloaded a model and nothing happened". Restoring it is a small change. Pinned by `tests/download-no-auto-activate.test.ts`. |
| D4 | **Pause is retained**, and so is resume. `ModelCard` still offers Pause/Resume and the store still routes them. | A conscious divergence: the reference app has **no paused state at all**. Its only alternative to letting a download continue is cancelling, which deletes the partial file. On a metered connection, pausing a multi-gigabyte download and resuming it later is the capability that matters. | One extra state the reference does not have, to keep and to reason about (the paused row is `Result.success()` with the bytes kept rather than a retry that burns backoff). Nothing a user can trip over; the cost is code, not behaviour. |
| D5 | The progress caption's **byte and speed figures now use one base** (both decimal, speed divided by 1000). Byte formatting itself stays decimal (`kB`/`MB`/`GB`). | The reference divides the speed by 1024 while formatting the bytes by 1000, so one line read `1.05 MB (5.42 MB/s)` — two numbers about 5% apart on the same line. Contradicting itself is not a feature to copy. | Byte strings and captions read differently from the reference app's. That is the whole cost, and it is deliberate. Pinned by `tests/progress.test.ts`. |
| D6 | The ETA's **missing hours branch is kept**. A 3 GB model at 3 MB/s renders `1000 min`. | It is the reference app's output, and matching output verbatim was the goal. | A slow long download renders an absurd-looking number of minutes instead of `16 h 40 min`. Kept because the reference does the same; changing it would be a divergence, not a fix. |
| D7 | **`POST_NOTIFICATIONS` is never requested.** The per-download prompt (and its helper module, deleted on 2026-10-09 at the user's request; last known as `lib/models/notification-permission.ts` before the store/services reorganization) was removed on 2026-10-09 at the user's request. The worker still posts its foreground-service notification — that is what lifts WorkManager's ten-minute cap on a multi-GB transfer — but on Android 13+ it is suppressed until the permission is granted from system settings. | A prompt before every download is nagging, and the answer was never read. Restoring it is a small change if the missing notification is felt. | **No download progress is visible outside the app on Android 13+** without a manual grant in system settings. |
| D8 | The **storage re-check interval on cards is 15 s** (`POLL_MS` in `hooks/useStorageDisclosure.ts`), against **10 s** in the reference (`SPACE_CHECK_MS` in `services/downloads/download-service.ts`, the legacy driver's own watch). | The 15 s poll exists to re-enable a greyed-out Download button quickly after the user frees space, without asking the filesystem the same question every frame. | **On a card the free-space reading can be up to 15 s stale.** A model that does not fit may show an enabled button for up to 15 s after the disk fills, or a disabled one for up to 15 s after space is freed. The authoritative pre-flight (D2) runs again at start, so the worst case is a refused-with-a-reason download, never a disk filled by accident. The legacy path still polls at the reference's 10 s. |
| D9 | **One progress idiom on every surface.** Every download surface renders the same bar (`ProgressTrack`/`DownloadProgressBar`, 8 px tall with a 5 px radius — the reference's proportions), in **this app's own colour tokens** (`bg-surface-2` track, `bg-primary` fill). The reference's gradient wash across the whole Hugging Face file card, in a hardcoded non-token colour, is **not adopted**. | A single bar everywhere reads as consistency rather than as a bug, and a gradient wash in a hardcoded colour would be the one download surface not wearing the app's theme. | **Hugging Face file cards do not look like the reference app's.** The dimensions match; only the treatment differs. Pinned by `tests/progress-bar.test.ts`, which asserts both the tokens and the absence of the wash. |
| D10 | ~~**Settings has a storage row**~~ — **STRUCK: reverted.** The row (`components/StorageSettings.tsx`) and its free-space helper were removed again; the download failure dialog's "Check the free space reported in Settings" step was deleted with it. | The row was added because the dialog's advice led nowhere. Reverted: free space is now reported on the download cards themselves (`hooks/useStorageDisclosure.ts`), next to the model size it is compared against, so the figure is where the decision is made and the dialog needs no detour. | A user out of space gets one action ("free some up, retry") instead of a figure to go read on another screen. **Source-verified against the vendored reference (2026-10-23):** its Settings carries no downloads storage row — free-disk figures appear only inside the ASR/TTS setup rows when storage is insufficient (`SettingsScreen.tsx:1207-1230`, `VoicePickerView.tsx:401`), so the strike stands. |

### Corrected, not divergent: the job-listing accessor is KEPT

`DownloadDriver.getAllJobs()` is **kept**. It has eight live call sites:

- `store/models/downloads.ts` — `startSpecDownload` (twice: the duplicate-job
  guard, and the stale-row sweep), `pauseModelDownload`,
  `resumeModelDownload`, `cancelModelDownload`
- `store/models/persistence.ts` — cold-start adoption of transfers that
  outlived the JS runtime
- `services/downloads/download-service.ts` — twice inside the free-space watcher
  (`stopSpaceWatchIfIdle`, `checkFreeSpace`)

An earlier draft of this feature's spec proposed deleting it as dead code,
on the grounds that no user interface renders it. **That was wrong**, and the
mistake is recorded here so it is not repeated: *unrendered is not uncalled,
and the difference is the whole review.* The research said no UI renders it;
the draft translated that into "no caller", reading past the four call sites
the same research cited. Deleting it would have cost the app the ability to
resume a download after a process death. Ticket 08 (delete dead code) was
withdrawn rather than re-scoped — there was no dead code to remove. Commit
`345018b`.

### Retry resumes; the reference restarts

Not a divergence from LiAI's older behaviour but the one to be aware of: the
reference app's retry **discards partial progress and starts from zero**.
Ours re-stats the disk and continues from the bytes already written — the
Retry button calls `resumeInterruptedDownload`, which routes through the same
`onDiskBytes` → `resumeDataForPartial` → `Range` path as a cold resume. On a
4 GB model that is the difference between re-transferring gigabytes and not.
Cost of keeping it: a retry on a genuinely corrupt partial file re-reads the
same bad bytes until the size checks catch it, which is the reason checksum
verification (deliberately out of scope, see "Known gaps") is the next thing
this area would want.

## Reference engine internals (verified against the vendored source)

Re-verified 2026-10-23 against `pocketpal-ai/` (read-only). These are the
row-level pins the `download-native-parity` tickets rest on; ticket numbers
in brackets.

### `pocketpal-ai/.../download/DownloadEngine.kt` (382 lines)

- `run()` 50-77: `runs.withDestinationLock(destination)` (57); CAS into
  RUNNING from `ENTRY_STATES = [QUEUED, RUNNING]`, `casStatus(…) == 0` →
  another runner owns it → DONE (58-60); transfer runs on `Dispatchers.IO`
  (63); `finish()` runs `NonCancellable` (68-75).
- `finish()` 79-116: Completed → CAS COMPLETED (84-87); Superseded →
  CANCELLED (88-91); Stopped → user-initiated stop `dao.fail(STOPPED_ERROR,
  keptBytes)` — `.part` bytes kept — else CAS back to QUEUED = RESCHEDULE
  (92-99); Failed → `dao.fail(keptBytes)` (100-103); GaveUp →
  `stalledRuns = wroteBytes ? 0 : row.stalledRuns + 1`, and at
  `MAX_STALLED_RUNS` (5) `dao.fail(STALLED_ERROR)` else QUEUED + RESCHEDULE
  (104-114). [ticket 04]
- `Transfer.run()` 131-156: `adopt()` first (132); one in-run restart at most
  → `part.delete()` + `End.Failed(REMOTE_CHANGED_ERROR)` and the void/etag
  state resets (133-146); backoff loop: resets to `INITIAL_BACKOFF_MS` when
  bytes advanced since the last failure, ends the run at
  `GIVE_UP_AFTER_MS` with no bytes (150), `sleepUnlessStopped` steps the
  sleep at 250 ms and doubles the backoff to `MAX_BACKOFF_MS` (148-153).
  [tickets 02/04]
- `adopt()` 158-176: proceeds when a `.part` exists or the final file is
  absent; a NEWER COMPLETED row at the same destination → Superseded
  (160-163); unknown-size row (`totalBytes <= 0`) → delete any in-place file
  ("Could not remove the previous download", 164-168); final file at exactly
  `totalBytes` → `writeProgress` + Completed (169-172); otherwise the
  in-place file is renamed to `.part` ("Could not move the partial download
  aside", 173-175). [ticket 05]
- `attempt()` 178-196: `call.execute().use`; `SSLPeerUnverifiedException` →
  Stopped (if stopped) else Failed with the message (184-185); `IOException`
  → Stopped if stopped else Transient (186-192). [tickets 02/04]
- `request()` 198-209: UA `PocketPal/${version} (ai.pocketpal)`, Bearer
  authToken, and only when `offset > 0`: `Range: bytes=offset-` +
  `If-Range: <etag>`.
- `respond()` 211-250: 200 → `strongEtag`, `totalBytes = contentLength
  (if > 0 else 0)`, `writeValidators(id, etag, totalBytes, 0) == 0` → Stopped
  (215-219); 206 → parse `CONTENT_RANGE` (`bytes (\d+)-(\d+)/(\d+|\*)`, 362)
  or Restart; valid iff start == offset AND (totalBytes <= 0 OR total ==
  totalBytes) AND (etag == null OR response etag == null OR equal)
  (227-230), missing validators adopted via `writeValidators(…, offset)`
  (231-235), then append write (236); 416 → `UNSATISFIED_RANGE`
  (`bytes */(\d+)`, 363), complete iff offset > 0 AND (totalBytes > 0 ?
  offset == totalBytes : total == offset) else Restart, `totalBytes = offset`
  → Completed (238-244); 408/429/500..599 → Transient (246); 400..499 →
  `Failed("Client error: N")` (247); anything else →
  `Failed("Unexpected response: N")` (248). [tickets 02/03]
- `write()` 252-271: `FileOutputStream(part, append)` + 64 KB
  `BufferedOutputStream`; every I/O failure is wrapped by `storage{}` into
  `Failed("Could not write the download: …")`; on Completed the stream is
  closed inside `storage{}` so the rename cannot race an open fd.
  [ticket 05]
- `copy()` 273-293: 64 KB buffer; flush + `dao.writeProgress(…)` at every
  `progressIntervalMs` boundary (a 0 row there → Stopped); read loop end →
  Completed. `commit()` 295-306: size check (`totalBytes > 0 && length !=
  totalBytes` → delete `.part` + SIZE_MISMATCH_ERROR), then
  `part.renameTo(file)` ("Could not move the finished download into place").
  [ticket 05]
- Constants 347-369: `PART_SUFFIX = ".part"`, STOPPED/STALLED/
  REMOTE_CHANGED/SIZE_MISMATCH error strings, `MAX_STALLED_RUNS = 5`,
  `GIVE_UP_AFTER_MS = 120_000`, `INITIAL_BACKOFF_MS = 2_000`,
  `MAX_BACKOFF_MS = 30_000`, `SLEEP_STEP_MS = 250`, `BUFFER_SIZE = 64 * 1024`,
  `strongEtag()` rejects `W/` prefixes (318-319), shared OkHttp client with
  60 s read timeout (365-369).

### `pocketpal-ai/.../download/DownloadScheduler.kt` (137 lines)

API 34+ schedules a **JobScheduler user-initiated job first**
(`scheduleUserInitiated`, 108: `setUserInitiated(true)` 110,
`NETWORK_TYPE_ANY` 111, 30 s `BACKOFF_POLICY_EXPONENTIAL` 112,
`setEstimatedNetworkBytes` when the total is known 119), exceptions in
scheduling fall through to the WorkManager branch
(`enqueueUniqueWork("download_$id", REPLACE)`, 43). [ticket 06]

### LiAI side, gap pins (`modules/native-download/android/src/main/java/com/anonymous/liai/download/`)

- `DownloadWorker.kt:208-209` — every non-200/206 (including 408) fails flat
  `"HTTP N"`; no transient taxonomy. [ticket 02]
- `DownloadWorker.kt:238` — `RandomAccessFile(dest, "rw")` writes straight to
  the final path; no `.part`, no atomic rename, no `adopt()`. [ticket 05]
- `DownloadWorker.kt:186-189` — 429/5xx requeue (row forced to QUEUED) +
  `Result.retry()`; WorkManager owns the backoff curve, the engine has no
  in-process attempt loop. [ticket 04]
- `DownloadEntity.kt` — Room v1 (112), columns
  id/modelId/url/fileName/destination/expectedTotal/downloadedBytes/status/
  error/errorCode/ifRange/headers (:50); no `createdAt`/`etag`/`totalBytes`/
  `stalledRuns`. Its `DownloadDao` has no `casStatus` / returning
  `writeProgress` / `writeValidators` / `byDestination` / `endTransientRun`
  (the reference has all five: `DownloadDao.kt:18,30,45,48,54`; its
  `DownloadEntity.kt:17` carries `createdAt`). Tickets 04/05 therefore also
  port the DAO surface and add the v1→v2 migration.

## Known gaps, accepted for now

- **ENOSPC loops.** `DownloadWorker.kt` catches `IOException` →
  `Result.retry()`, so a genuinely full disk retries on exponential backoff
  indefinitely and the card reads "downloading" forever. PocketPal has the
  identical shape. Fix would be a `StatFs` pre-flight plus a specific ENOSPC
  branch, ~40 lines of Kotlin that `npm test` (Jest) cannot reach.
- **Nothing enumerates the models directory.** A `.gguf` on disk with no
  matching spec row is never listed, never reclaimed. True of both apps.
- **No sha256** — see non-divergence 2.
- **`DownloadProgressCard` was the layout reference for the caption and is
  dead code in PocketPal** — exported at `src/components/index.ts:64`,
  rendered nowhere, its `bytesLabel` format existing only in a JSDoc
  comment. The caption therefore mirrors the *live* model-card string at
  `ModelsScreen/ModelCard/ModelCard.tsx:798-813` instead.

## Bugs found and fixed

1. **`reportPaused` reported 0 % over a 60 % file** (`reportPaused()` in
   `services/downloads/download-service.ts`, fix recorded in the 2026-10
   audit).
   The `null` path from `downloadAsync` — a native-initiated pause from the
   background session — spread the closure's `job` parameter, whose progress
   was still the value at start. Now spreads the mirror's entry, which is
   what `pauseDownload` already did. Visible as the bar snapping to 0 % on
   resume.
2. **`ProjectorSelectorSheet` rendered raw `downloadProgress`** with no clamp,
   so a re-stat mid-reconcile could render `104%`. `Math.min(100,
   Math.max(0, …))` was open-coded in two other components; it is now
   `services/models/progress.ts:clampPercent` with all three call sites on it and
   `tests/progress.test.ts` covering overshoot and negative.

## Not checked

- ~~Whether PocketPal's worker refreshes its foreground notification.~~
  Answered: PocketPal ships **no** foreground notification at all.
- PocketPal's `DownloadEntity.kt` 1→2 migration body (schema reference for
  the v1→v2 migration tickets 04/05 must add) and its
  `DownloadManager.test.ts` mock contract (only needed if the JS event
  surface changes — the port works below it).
- `modules/native-download/ios/` — there is no parallel worker to compare;
  unaffected by this port.
- The Kotlin in `modules/native-download/` has **no test coverage**
  (`npm test` is Jest — via `jest.config.js` — and cannot reach Kotlin).
  Ticket 01 closes this by standing up the JUnit/Robolectric harness and
  porting the reference suites; until a ticket's ported tests run, its
  native changes stay marked unverified. All download logic currently under
  test lives in the pure helpers (`resume-state`, `http-retry`,
  `download-jobs`, `download-error`, `vision-pairing`, `file-state`).
