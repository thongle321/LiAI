# PocketPal native download module — audit and parity verdict

Date: 2026-10-08
Scope: `pocketpal-ai/src/specs/NativeDownloadModule.ts` + `pocketpal-ai/android/.../download/`
vs `modules/native-download/`, `lib/download-service.ts`, `lib/android-download-service.ts`,
`store/models/downloads.ts`.

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
| Progress cadence | Room write at 1 Hz + LiveData events | Room write at 1 Hz + events + 1 s JS poll | same cadence |
| Terminal delivery | immediate events | immediate events + poll, deduped by `claimTerminal` (`lib/models/download-jobs.ts`) | same |
| 10-minute cap | WorkManager's cap applies (no foreground service) | foreground service + notification, `FOREGROUND_SERVICE_TYPE_DATA_SYNC` | better (missing in PocketPal) |
| Notification progress | none at all | determinate bar re-emitted on every 1 Hz write; spinner only when total unknown | better |
| Paused row at worker entry | `Result.retry()` — burns backoff cycles | `Result.success()`, bytes kept | better |
| pause / resume / retry from JS | 4 of 9 verbs dead from JS | all 7 verbs called | better |
| Room row lifecycle | rows grow forever | `forgetDownload` on `removeJob` | better |
| Re-adopt after JS death | `reattachDownloadObserver` re-attaches LiveData | `reconcileWithNative` polls `getActiveDownloads` + `claimTerminal` | same behavior, different mechanism |
| Disk classification on cold start | JS-less; worker reconciles file vs DB | worker reconciles, and `reconcileInterrupted` **skips** specs the native store knows (`knownModelIds`) | same, ordering documented |
| Auth token at rest | plaintext `authToken` Room column (v1→v2 migration) | plaintext `headers` JSON in Room; source is SecureStore | same exposure |
| Free space | JS pre-flight only | JS pre-flight + 10 s live poll on the legacy path | better |
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
2. **ETA is fed by our smoothed `speedBytesPerSec`**, not the reference's
   raw per-tick delta (`DownloadManager.ts:88-120`). Same string, steadier
   number: theirs renders `ETA: 0 sec` on any stalled tick.
3. **`formatBytes` is decimal base 1000 with `kB`**, ported verbatim from
   `utils/formatters.ts:16-41`. It replaced a binary `KB` implementation, so
   every byte string in the app shifted.
4. **Mixed unit bases are inherited, not fixed.** `progressCaption`
   divides the speed by 1024 and formats the bytes by 1000, so the two
   numbers on one line disagree by ~5%. Mirrored so the strings match;
   pinned by `tests/progress.test.ts`.
5. **No hours branch.** A 3 GB model at 3 MB/s renders `1000 min`, exactly
   as PocketPal does.
6. **The dead `activeDownloads` store map is deleted.** It was write-only in
   LiAI too; the reference has no equivalent map at all.

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