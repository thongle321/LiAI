# PocketPal native download module — audit and parity verdict

Date: 2026-10-08 (updated 2026-10 by `download-ui-parity`)
Scope: `pocketpal-ai/src/specs/NativeDownloadModule.ts` + `pocketpal-ai/android/.../download/`
vs `modules/native-download/`, `lib/download-service.ts`, `lib/android-download-service.ts`,
`store/models/downloads.ts`.

Since the 2026-10 update the document also covers the download *UI*, not only
the native module — see "Deliberate differences in the download UI, and what
each one costs". `pocketpal-ai/` is not vendored in this worktree, so every
statement about the reference app's behaviour rests on the recorded research
and on `.scratch/download-ui-parity/spec.md`, not on a re-read of its source.

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
| Resume safety | `Range` from file length, no validator | `Range` + `If-Range` + oversize-partial guard | better |
| HTTP status handling | 401/403/429 → generic 4xx terminal failure; FAILED while WorkManager still retries 5xx | auth-specific copy for 401/403; 429 + 5xx retry with row = QUEUED | better |
| Total size source | response `Content-Length` (`PW:176-194`); iOS takes raw `contentLength` with no 206 correction | response total, `206 → existing + contentLength`, chunked `-1` falls back to catalog (`DownloadWorker.kt` transfer); legacy driver guards expo's `-1 + N` (`download-service.ts` handleProgress) | same on Android, better on iOS |
| Size-mismatch check | none visible — total just follows the response | compares disk against the adopted server total, catalog when the server reported none | same, plus a check |
| Progress cadence | Room write at 1 Hz + LiveData events | Room write at 1 Hz + events, single writer | same |
| Terminal delivery | immediate events | immediate events, deduped by `claimTerminal` (`lib/models/download-jobs.ts`) | same |
| 10-minute cap | WorkManager's cap applies (no foreground service) | foreground service + notification, `FOREGROUND_SERVICE_TYPE_DATA_SYNC` | better (missing in PocketPal) |
| Notification progress | none at all | determinate bar re-emitted on every 1 Hz write; spinner only when total unknown | better |
| `POST_NOTIFICATIONS` request | before every download, per the reference app (`pocketpal-ai/` is not vendored in this worktree, so this rests on the spec, not on a re-read) | before every transfer, in the start path (`lib/models/notification-permission.ts`), never at launch | same, and deliberately so: a user who declined is asked again. Not a gate — the answer is never read, so the download runs either way |
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

1. **No `.part` temp file + atomic rename.** Both apps write straight to the
   final `.gguf`; correctness is recovered by size, not by atomicity. Adding
   `.part` would have broken resume outright: `reconcileInterrupted`
   (`downloads.ts:453`) and `onDiskBytes():118` stat the **final** path, so a
   `.part` file reads as `absent` and every kill-then-resume would restart
   from zero — defeating the point of the Android driver.
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
   (`lib/models/download-jobs.ts`); the formula is the reference's exactly
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

`pocketpal-ai/` is **not vendored in this worktree**, so the reference side of
each row below rests on the spec and on the research recorded earlier in this
document, not on a re-read of the reference source. Anything that would need
the reference's file contents to check is called out as such.

| # | Divergence | Why | Cost |
|---|---|---|---|
| D1 | The global download banner / overlay stays deleted. No `DownloadBanner`, no `DownloadOverlay`, no floating badge, no cross-screen download indicator anywhere in `app/` or `components/`. | Decided twice before this feature and again in it. The reference mounts an overlay above the app switch point with a `+N` badge, a Stop pill and a per-model dismiss; downloads are visible on `/models` only. | **A download started anywhere is invisible off `/models`, and cancelling it means navigating back to `/models` first.** The composer placeholder ("Loading model…") and the chat empty placeholder ("<name> is getting ready") are the only cross-screen signal. Secondary: deleting it removed an app-wide double top inset, so that is a benefit, not a cost. |
| D2 | The storage pre-flight **fails closed**. Unreadable or non-finite free space blocks the download (`lib/storage-fit.ts:modelFitsOnDevice`). This is a reversal of our own earlier policy, which failed open with "unknown free space must never disable a download button". | Matches the reference. A transfer that runs out reports its own failure honestly; a permanently disabled button explains nothing. | **A device whose free-space read always throws can never start any download, permanently.** That is the single most likely line here to need revisiting. The reversal is one line — treat `freeBytes === null` as a fit — and the reasoning is in the header of `lib/storage-fit.ts`. The card surfaces additionally *say* so ("Couldn't read storage — download needs a free-space check") rather than greying out silently. |
| D3 | **No auto-activation of a completed download.** The `setActiveModel` call that used to sit in the downloads store's completion path is gone, so no path — main leg, vision-projector leg, or cold-start adoption of a transfer that outlived the JS runtime — selects a model as a side effect of a download finishing. Activation is an explicit **Load** under "Ready to use". | The reference never auto-loads. | **A first-time user who downloads their only model lands on an empty chat with nothing selected and must tap Load.** The card does flip to Downloaded with a Load control, and the empty-chat copy was corrected to stop promising self-activation, but the contrast with the previous behaviour is stark and will read to a user as "I downloaded a model and nothing happened". Restoring it is a small change. Pinned by `tests/download-no-auto-activate.test.ts`. |
| D4 | **Pause is retained**, and so is resume. `ModelCard` still offers Pause/Resume and the store still routes them. | A conscious divergence: the reference app has **no paused state at all**. Its only alternative to letting a download continue is cancelling, which deletes the partial file. On a metered connection, pausing a multi-gigabyte download and resuming it later is the capability that matters. | One extra state the reference does not have, to keep and to reason about (the paused row is `Result.success()` with the bytes kept rather than a retry that burns backoff). Nothing a user can trip over; the cost is code, not behaviour. |
| D5 | The progress caption's **byte and speed figures now use one base** (both decimal, speed divided by 1000). Byte formatting itself stays decimal (`kB`/`MB`/`GB`). | The reference divides the speed by 1024 while formatting the bytes by 1000, so one line read `1.05 MB (5.42 MB/s)` — two numbers about 5% apart on the same line. Contradicting itself is not a feature to copy. | Byte strings and captions read differently from the reference app's. That is the whole cost, and it is deliberate. Pinned by `tests/progress.test.ts`. |
| D6 | The ETA's **missing hours branch is kept**. A 3 GB model at 3 MB/s renders `1000 min`. | It is the reference app's output, and matching output verbatim was the goal. | A slow long download renders an absurd-looking number of minutes instead of `16 h 40 min`. Kept because the reference does the same; changing it would be a divergence, not a fix. |
| D7 | `POST_NOTIFICATIONS` is requested **on every user-initiated download**, in the start path rather than at app launch (`lib/models/notification-permission.ts`). Declined, previously-denied, a missing permission API and a throwing request all proceed with the download — the outcome is never read. The **vision projector's continuation leg deliberately does not prompt** (`promptForNotifications: false`). | Requested in the download path so the prompt arrives while the feature that needs it is in use. Per-download matches the reference. Before Android 13 the worker posts a foreground-service notification that was being silently suppressed, so this is the difference between a visible and an invisible download. | **A user who declined is asked again on every download.** That is the reference's behaviour and was chosen over a once-only request. The projector leg is exempt because the user did not start that download and re-prompting for a leg they never asked for would be the clearest instance of nagging. |
| D8 | The **storage re-check interval on cards is 15 s** (`POLL_MS` in `hooks/useStorageDisclosure.ts`), against **10 s** in the reference (`SPACE_CHECK_MS` in `lib/download-service.ts`, the legacy driver's own watch). | The 15 s poll exists to re-enable a greyed-out Download button quickly after the user frees space, without asking the filesystem the same question every frame. | **On a card the free-space reading can be up to 15 s stale.** A model that does not fit may show an enabled button for up to 15 s after the disk fills, or a disabled one for up to 15 s after space is freed. The authoritative pre-flight (D2) runs again at start, so the worst case is a refused-with-a-reason download, never a disk filled by accident. The legacy path still polls at the reference's 10 s. |
| D9 | **One progress idiom on every surface.** Every download surface renders the same bar (`ProgressTrack`/`DownloadProgressBar`, 8 px tall with a 5 px radius — the reference's proportions), in **this app's own colour tokens** (`bg-surface-2` track, `bg-primary` fill). The reference's gradient wash across the whole Hugging Face file card, in a hardcoded non-token colour, is **not adopted**. | A single bar everywhere reads as consistency rather than as a bug, and a gradient wash in a hardcoded colour would be the one download surface not wearing the app's theme. | **Hugging Face file cards do not look like the reference app's.** The dimensions match; only the treatment differs. Pinned by `tests/progress-bar.test.ts`, which asserts both the tokens and the absence of the wash. |
| D10 | **Settings has a storage row** (`components/StorageSettings.tsx`): a free-space figure, a refresh action, and a plain "Couldn't read storage" when the read fails. | The download failure dialog already told the user to "Check the free space reported in Settings", and Settings showed no figure — the advice led nowhere. The advice text is unchanged; the screen now honours it. | One row, not a usage breakdown: no disk-usage browsing, no prune action, no orphan-file enumeration. All deliberately out of scope. **Unverified against the reference:** `pocketpal-ai/` is absent from this worktree, so whether the reference's Settings carries an equivalent row could not be re-checked here. |

### Corrected, not divergent: the job-listing accessor is KEPT

`DownloadDriver.getAllJobs()` is **kept**. It has eight live call sites:

- `store/models/downloads.ts` — `startSpecDownload` (twice: the duplicate-job
  guard, and the stale-row sweep), `pauseModelDownload`,
  `resumeModelDownload`, `cancelModelDownload`
- `store/models/persistence.ts` — cold-start adoption of transfers that
  outlived the JS runtime
- `lib/download-service.ts` — twice inside the free-space watcher
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

## Known gaps, accepted for now

- **ENOSPC loops.** `DownloadWorker.kt` catches `IOException` →
  `Result.retry()`, so a genuinely full disk retries on exponential backoff
  indefinitely and the card reads "downloading" forever. PocketPal has the
  identical shape. Fix would be a `StatFs` pre-flight plus a specific ENOSPC
  branch, ~40 lines of Kotlin that `node --test` cannot reach.
- **Nothing enumerates the models directory.** A `.gguf` on disk with no
  matching spec row is never listed, never reclaimed. True of both apps.
- **No sha256** — see non-divergence 2.
- **`DownloadProgressCard` was the layout reference for the caption and is
  dead code in PocketPal** — exported at `src/components/index.ts:64`,
  rendered nowhere, its `bytesLabel` format existing only in a JSDoc
  comment. The caption therefore mirrors the *live* model-card string at
  `ModelsScreen/ModelCard/ModelCard.tsx:798-813` instead.

## Bugs found and fixed

1. **`reportPaused` reported 0 % over a 60 % file** (`lib/download-service.ts:339`).
   The `null` path from `downloadAsync` — a native-initiated pause from the
   background session — spread the closure's `job` parameter, whose progress
   was still the value at start. Now spreads the mirror's entry, which is
   what `pauseDownload` already did. Visible as the bar snapping to 0 % on
   resume.
2. **`ProjectorSelectorSheet` rendered raw `downloadProgress`** with no clamp,
   so a re-stat mid-reconcile could render `104%`. `Math.min(100,
   Math.max(0, …))` was open-coded in two other components; it is now
   `lib/models/progress.ts:clampPercent` with all three call sites on it and
   `tests/progress.test.ts` covering overshoot and negative.

## Not checked

- ~~Whether PocketPal's worker refreshes its foreground notification.~~
  Answered: PocketPal ships **no** foreground notification at all.
- `DownloadEntity.kt`'s 1→2 migration body, and PocketPal's
  `DownloadManager.test.ts` mock contract.
- `modules/native-download/ios/` — there is no parallel worker to compare.
- The Kotlin in `modules/native-download/` has no test coverage at all: it is
  native-bound and `npm test` is `node --test tests/*.ts`. All download logic
  under test lives in the pure helpers (`resume-state`, `http-retry`,
  `download-jobs`, `download-error`, `vision-pairing`, `file-state`).