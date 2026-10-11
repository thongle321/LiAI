# Parity verification: LiAI's download JS integration vs pocketpal-ai

Verifies whether D:/aivision's Android native-download JS integration matches the
pattern pocketpal-ai uses. This is a check of the code as it stands after commits
`bd162dc` (the four changes) and `c121d34` (the two bugs review found in them) —
not a restatement of `pocketpal-js-integration.md`, which drove the original work.

Primary sources read: `pocketpal-ai/src/services/downloads/DownloadManager.ts` (719 lines),
`pocketpal-ai/.../download/DownloadModule.kt`, and LiAI's `lib/android-download-service.ts`,
`lib/download-service.ts`, `store/models/downloads.ts`, `store/models/persistence.ts`,
`modules/expo-download/src/ExpoDownloadModule.ts`.

## Verdict

**The cold-start-after-kill path is functionally at parity.** Every behaviour
PocketPal has on that path, LiAI now has. The one structural difference runs in
LiAI's favour and is the reason the module survives JS teardown at all.

## What matches

| Concern | PocketPal | LiAI |
|---|---|---|
| Cold-start sync | `syncWithActiveDownloads` after model-store init (`DownloadManager.ts:624`) | `reconcileWithNative` in `loadPersisted`, after `reconcileInterrupted` |
| Foreground/resume re-sync | **none** — zero `AppState` references in `DownloadManager.ts` | none |
| Unlink partial on cancel | yes (`DownloadManager.ts:521-543`) | `forgetDownload` + `removeJob` |
| Join cold-started record | by download id | by `modelId`, which the native record carries |

## The one divergence — and it is LiAI's advantage

PocketPal re-attaches a **per-download WorkInfo observer** on every cold-started
record:

```ts
if (NativeDownloadModule.reattachDownloadObserver) {
  await NativeDownloadModule.reattachDownloadObserver(download.id);
}
```
(`DownloadManager.ts:701-708`)

LiAI has no such verb and does not need one. It keeps **one module-level event
subscription** (`android-download-service.ts:113`) and polls
`getActiveDownloads()` at 1 Hz, while the worker writes progress to Room at 1 Hz.
PocketPal needs the reattach call precisely *because* its observers are per-download
and die with JS; LiAI's polling design has nothing to re-attach. Copying
`reattachDownloadObserver` would add a verb that duplicates the poll.

## Native verbs each side actually calls

PocketPal: `startDownload`, `cancelDownload`, `getActiveDownloads`,
`reattachDownloadObserver`.

LiAI: `startDownload` (`android-download-service.ts:174`), `pauseDownload`,
`resumeDownload` (:272), `retryDownload`, `cancelDownload`, `getActiveDownloads`,
`forgetDownload`.

LiAI is a superset. The two extras that matter: `retryDownload` (a FAILED card is
resumable — PocketPal has this too, LiAI added it in `1850066`) and
`forgetDownload` (unlinks the record, so the Room table does not grow a row per
download forever).

## Not gaps

- **No foreground/resume re-sync on either side.** PocketPal has zero `AppState`
  usage in its download manager, so LiAI matching it is parity, not a omission.
- **`reattachDownloadObserver` absent.** Covered above — deliberate.

## Resolved: the Authorization header in Room

Flagged in review as a possible `AGENTS.md` violation ("Store user-provided keys in
SecureStore"). Checked against pocketpal-ai, the reference implementation:

PocketPal stores the token **plaintext in Room** too — `authToken: String? = null`
(`DownloadEntity.kt:19`), read from the download config at start
(`DownloadModule.kt:69`), applied as `Authorization: Bearer $token` in the worker
(`DownloadWorker.kt:91`). No SecureStore, no EncryptedSharedPreferences, no cipher
anywhere in their download package.

LiAI is therefore already at parity: `headers: Map<String, String>` in Room
(`DownloadEntity.kt:49`), applied via `record.headers.forEach { header(k, v) }`
(`DownloadWorker.kt:138`). Both keep it in app-private storage, which is what the
after-process-death requirement needs — the worker must authenticate with JS dead,
and WorkManager's own inputData is itself persisted to disk.

No change made. Adopting SecureStore here would diverge from the chosen reference
and add a native key-lookup path for no security gain over PocketPal.
