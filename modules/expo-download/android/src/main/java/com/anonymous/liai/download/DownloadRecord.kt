package com.anonymous.liai.download

/** Where a download is in its life. Mirrors the JS `ModelDownloadStatus`
 *  vocabulary so the bridge does not have to translate, with `QUEUED` as the
 *  one state JS has no word for: WorkManager has accepted the job but not
 *  started the worker yet.
 *
 *  Same six values as pocketpal-ai's `DownloadStatus`; the Room entity, the
 *  DAO, and the store all live in DownloadEntity.kt / DownloadStore.kt. */
enum class DownloadState {
    QUEUED,
    RUNNING,
    PAUSED,
    COMPLETED,
    FAILED,
    CANCELLED,
}
