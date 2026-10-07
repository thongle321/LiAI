package com.anonymous.liai.download

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.work.await
import androidx.work.workDataOf
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * Android-native model downloads.
 *
 * WHY THIS EXISTS: iOS already gets background-surviving downloads from
 * expo-file-system's `FileSystemSessionType.BACKGROUND`, which hands the
 * transfer to a real background NSURLSession. Android has no equivalent —
 * expo's legacy downloader ignores `sessionType` entirely and runs on a
 * Dispatchers.IO coroutine inside the app process, so the transfer dies with
 * it. WorkManager is the only thing that keeps running, which is why this
 * exists as a local Expo module rather than more JS.
 *
 * PROGRESS IS POLLED, NOT ONLY PUSHED. The one event carries state
 * transitions, but `emitNative` returns early whenever the JS object is gone
 * — which is exactly the situation this module exists for. A download that
 * outlasts the JS runtime must be able to report itself when JS comes back,
 * so [getActiveDownloads] reads the same durable store the worker writes and
 * is the source of truth. Events are an optimisation; polling is the contract.
 */
class ExpoDownloadModule : Module() {
    /** reactContext is nullable in the API surface; every function here needs a
     *  real Context to reach WorkManager and the files dir, so failing loudly
     *  at the boundary is better than a silent no-op later. */
    private val ctx: Context
        get() = requireNotNull(appContext.reactContext) { "no react context" }

    private val workManager: WorkManager
        get() = WorkManager.getInstance(ctx)

    private val store: DownloadStore
        get() = DownloadStore(File(ctx.filesDir, DownloadWorker.STORE_NAME))

    override fun definition() =
        ModuleDefinition {
            Name("ExpoDownload")

            Events("onDownloadEvent")

            AsyncFunction("pingAsync") { "pong" }

            AsyncFunction("startDownload") { record: DownloadRequest ->
                val downloadId = record.id.ifEmpty { error("id is required") }
                // REPLACE, not KEEP: the caller owns the lifecycle for one
                // file at a time, and a stale queued job for the same id would
                // otherwise race the new one.
                workManager.enqueueUniqueWork(
                    workName(downloadId),
                    ExistingWorkPolicy.REPLACE,
                    OneTimeWorkRequestBuilder<DownloadWorker>()
                        .setInputData(workDataOf(DownloadWorker.KEY_ID to downloadId))
                        .setConstraints(
                            Constraints
                                .Builder()
                                .setRequiredNetworkType(NetworkType.CONNECTED)
                                .build(),
                        ).setBackoffCriteria(
                            BackoffPolicy.EXPONENTIAL,
                            WorkRequest_MIN_BACKOFF_MILLIS,
                            TimeUnit.MILLISECONDS,
                        ).build(),
                )
                store.upsert(downloadId) { existing ->
                    DownloadRecord(
                        id = downloadId,
                        modelId = record.modelId,
                        url = record.url,
                        fileName = record.fileName,
                        destinationPath = record.destinationPath,
                        expectedTotal = record.expectedTotal.toLong(),
                        state = DownloadState.QUEUED,
                        downloadedBytes = existing?.downloadedBytes ?: 0L,
                        ifRange = record.ifRange,
                        headers = record.headers,
                    )
                }
            }

            AsyncFunction("pauseDownload") { downloadId: String ->
                workManager.cancelUniqueWork(workName(downloadId))
                // CANCELLED_BY_WORK_REQUEST means WorkManager stopped us, which
                // is what a pause IS — the bytes stay on disk and the record
                // becomes resumable.
                store.mutate(downloadId) { it.copy(state = DownloadState.PAUSED) }
            }

            AsyncFunction("resumeDownload") { downloadId: String ->
                val record = store.get(downloadId) ?: throw CodedException("no such download")
                // Resume means "continue what I paused" — nothing else. A
                // FAILED record is terminal and is not resumable; that is
                // retryDownload's job, and conflating them left Retry on a
                // failed card throwing into a swallowed catch.
                if (record.isTerminal() && record.state != DownloadState.PAUSED) {
                    throw CodedException("download is not resumable")
                }
                store.mutate(downloadId) { it.copy(state = DownloadState.QUEUED, error = null) }
                enqueue(downloadId)
            }

            /** Retry after a FAILURE, with no terminal-state guard. PocketPal
             *  parity: DownloadModule.kt:262-284 sets QUEUED and enqueues
             *  regardless of how the last attempt ended. Distinct from
             *  resume because the user-facing verbs are: Resume continues a
             *  paused transfer, Retry restarts one that died. The partial on
             *  disk is untouched either way, so a retry resumes from it. */
            AsyncFunction("retryDownload") { downloadId: String ->
                if (store.get(downloadId) == null) throw CodedException("no such download")
                store.mutate(downloadId) {
                    it.copy(
                        state = DownloadState.QUEUED,
                        error = null,
                        errorCode = null,
                    )
                }
                enqueue(downloadId)
            }

            AsyncFunction("cancelDownload") { downloadId: String ->
                workManager.cancelUniqueWork(workName(downloadId))
                store.get(downloadId)?.let { record ->
                    // Cancel abandons the partial; a paused download keeps it.
                    runCatching { File(record.destinationPath).delete() }
                }
                store.mutate(downloadId) { it.copy(state = DownloadState.CANCELLED) }
            }

            /** The contract, not the optimisation: every non-terminal record,
             *  read from the same store the worker writes. This is what JS
             *  calls after a cold start to find work it never saw. */
            AsyncFunction("getActiveDownloads") {
                store.all().map { it.toWritableMap() }
            }

            /** Await the terminal state of one download. Used by the retry
             *  path so JS does not have to poll on a timer. */
            AsyncFunction("awaitDownload") Coroutine { downloadId: String ->
                val info =
                    workManager.getWorkInfosForUniqueWork(workName(downloadId)).await()
                val live =
                    info.firstOrNull {
                        it.state == WorkInfo.State.ENQUEUED || it.state == WorkInfo.State.RUNNING ||
                            it.state == WorkInfo.State.BLOCKED
                    }
                if (live == null) store.get(downloadId)?.toWritableMap() else null
            }

            OnStartObserving {
                // Re-emit whatever the store already holds. Without this, a
                // download that completed while JS was dead produces no event
                // at all and the UI silently disagrees with the disk.
                store.all().filterNot { it.isTerminal() }.forEach { sendEvent(EVENT, it.toWritableMap()) }
            }
        }

    private fun DownloadRecord.toWritableMap(): Map<String, Any?> =
        mapOf(
            "id" to id,
            "modelId" to modelId,
            "fileName" to fileName,
            "destinationPath" to destinationPath,
            "expectedTotal" to expectedTotal,
            "state" to state.name.lowercase(),
            "downloadedBytes" to downloadedBytes,
            "error" to error,
            "errorCode" to errorCode,
        )

    /** The one place a transfer is handed to WorkManager, so start,
     *  resume, and retry cannot drift apart. */
    private fun enqueue(downloadId: String) {
        workManager.enqueueUniqueWork(
            workName(downloadId),
            ExistingWorkPolicy.REPLACE,
            OneTimeWorkRequestBuilder<DownloadWorker>()
                .setInputData(workDataOf(DownloadWorker.KEY_ID to downloadId))
                .setConstraints(
                    Constraints
                        .Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build(),
                ).setBackoffCriteria(
                    BackoffPolicy.EXPONENTIAL,
                    WorkRequest_MIN_BACKOFF_MILLIS,
                    TimeUnit.MILLISECONDS,
                ).build(),
        )
    }

    private fun workName(downloadId: String) = "expo-download-$downloadId"

    private companion object {
        const val EVENT = "onDownloadEvent"

        /** WorkManager's own floor for exponential backoff. */
        const val WorkRequest_MIN_BACKOFF_MILLIS = 10_000L
    }
}

/** The shape JS hands over to start a download.
 *
 *  MUST implement `Record` with `@Field` vars — a plain Kotlin class with
 *  constructor parameters compiles fine and then throws at runtime.
 *  `TypeConverterProvider.obtainNonNullableTypeConverter` walks primitives,
 *  collections, enums, `Record`, `View`, `SharedRef`, `SharedObject`,
 *  `JavaScriptFunction`, `ValueOrUndefined`, `Either`, and finally
 *  `throw MissingTypeConverter` (TypeConverterProvider.kt:104-172). A class
 *  that implements none of those lands on the throw.
 *
 *  Every field needs a default so `ObjectConstructorFactory` can find a
 *  constructor whose parameters are ALL optional
 *  (allocators/ObjectConstructorFactory.kt:31). */
class DownloadRequest : Record {
    @Field
    var id: String = ""

    @Field
    var modelId: String = ""

    @Field
    var url: String = ""

    @Field
    var fileName: String = ""

    @Field
    var destinationPath: String = ""

    @Field
    var expectedTotal: Double = 0.0

    /** HF LFS content id, sent as a quoted If-Range entity-tag. */
    @Field
    var ifRange: String? = null

    @Field
    var headers: Map<String, String> = emptyMap()
}
