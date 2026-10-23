package com.anonymous.liai.download

import android.content.Context
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.io.File

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
 *
 * SCHEDULING (ticket 06): every lifecycle verb hands off to
 * [DownloadScheduler] instead of touching WorkManager directly. On API 34+
 * that schedules the run as a JobScheduler user-initiated job first (no
 * ten-minute cap, the system owns the run) and falls back to WorkManager —
 * [WorkManagerPort] keeps the exact request shape this module always built,
 * so the fallback IS yesterday's behavior. Pause/cancel route through
 * cancelRunners, which stops ALL layers a run can live in (WorkManager
 * work, the UIDT job, the in-process signal).
 */
class NativeDownloadModule : Module() {
    /** reactContext is nullable in the API surface; every function here needs a
     *  real Context to reach WorkManager and the files dir, so failing loudly
     *  at the boundary is better than a silent no-op later. */
    private val ctx: Context
        get() = requireNotNull(appContext.reactContext) { "no react context" }

    /** The one place a run is handed to the OS: schedule prefers a
     *  user-initiated JobScheduler job on API 34+ and falls back to
     *  WorkManager inside [DownloadScheduler]; cancelRunners stops every
     *  layer a run can live in. Fresh per call like the WorkManager getter
     *  used to be — getInstance is cached, the ports cost nothing to build. */
    private val scheduler: DownloadScheduler
        get() = DownloadScheduler(ctx, DownloadRuns.process)

    private val store: DownloadStore
        get() = DownloadStore(DownloadDatabase.get(ctx))

    /** Module-scoped coroutine scope. Created in OnCreate rather than as a
     *  class field: the Expo lifecycle docs say OnCreate is preferred over
     *  class initializers, and OnDestroy is where the scope is cancelled — a
     *  field-initialised SupervisorJob outlives the module and leaks a
     *  collector on every reload. */
    private var scope: CoroutineScope? = null

    /** The Room Flow collector, cancelled on the LAST listener leaving. */
    private var observeJob: kotlinx.coroutines.Job? = null

    override fun definition() =
        ModuleDefinition {
            Name("NativeDownload")

            OnCreate {
                scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
            }

            OnDestroy {
                observeJob?.cancel()
                observeJob = null
                scope?.cancel()
                scope = null
            }

            Events("onDownloadEvent")

            // The store is Room-backed and suspend, so every function that touches it
            // is declared Coroutine. Previously they were plain AsyncFunctions
            // against a synchronous JSON file; faking that back with
            // runBlocking would put disk writes on the JS thread.
            // Coroutine's overloads are `suspend () -> R` and `suspend (P0) -> R`
            // with R and P0 both reified, and `Coroutine` is infix so explicit
            // type arguments do not parse on it. A one-argument lambda over a
            // custom class is therefore genuinely ambiguous and resolves to
            // neither. Naming the block's type first pins it. The String-typed
            // functions below escape this: P0 infers from a primitive.
            val startBlock: suspend (DownloadRequest) -> Unit = { record ->
                val downloadId = record.id.ifEmpty { error("id is required") }
                val existing = store.get(downloadId)
                store.upsert(
                    DownloadEntity(
                        id = downloadId,
                        modelId = record.modelId,
                        url = record.url,
                        fileName = record.fileName,
                        destination = record.destinationPath,
                        expectedTotal = record.expectedTotal.toLong(),
                        status = DownloadState.QUEUED,
                        downloadedBytes = existing?.downloadedBytes ?: 0L,
                        ifRange = record.ifRange,
                        headers = record.headers,
                        // Creation time never moves on REPLACE: a re-enqueue of
                        // the same id is an update, not a new birthdate, and
                        // ticket-05's supersede logic orders by it.
                        createdAt = existing?.createdAt ?: System.currentTimeMillis(),
                    ),
                )
                // Lifecycle now goes through the scheduler (ticket 06): it
                // cancels every still-live runner for this id first — the
                // "REPLACE, not KEEP" race this same-id re-enqueue used to
                // defend against — then schedules the UIDT-or-WorkManager
                // host with the catalog total (empty step for estimate).
                scheduler.schedule(downloadId, record.expectedTotal.toLong())
            }
            AsyncFunction("startDownload") Coroutine startBlock

            AsyncFunction("pauseDownload") Coroutine { downloadId: String ->
                scheduler.cancelRunners(downloadId)
                // CANCELLED_BY_WORK_REQUEST means the OS stopped us, which is
                // what a pause IS — the bytes stay on disk and the record
                // becomes resumable. The signal stop (from cancelRunners)
                // breaks a blocked read at once, so Pause is felt even on a
                // stalled connection.
                store.mutate(downloadId) { it.copy(status = DownloadState.PAUSED) }
            }

            AsyncFunction("resumeDownload") Coroutine { downloadId: String ->
                val record = store.get(downloadId) ?: throw CodedException("no such download")
                // Resume means "continue what I paused" — nothing else. A
                // FAILED record is terminal and is not resumable; that is
                // retryDownload's job, and conflating them left Retry on a
                // failed card throwing into a swallowed catch.
                if (isTerminal(record) && record.status != DownloadState.PAUSED) {
                    throw CodedException("download is not resumable")
                }
                store.mutate(downloadId) { it.copy(status = DownloadState.QUEUED, error = null) }
                // The ADOPTED total (a prior attempt learned it from the
                // response) is what the scheduler estimates network byte for;
                // the catalog count is the fallback.
                scheduler.schedule(downloadId, record.totalBytes ?: record.expectedTotal)
            }

            /** Retry after a FAILURE, with no terminal-state guard. PocketPal
             *  parity: DownloadModule.kt:262-284 sets QUEUED and enqueues
             *  regardless of how the last attempt ended. Distinct from
             *  resume because the user-facing verbs are: Resume continues a
             *  paused transfer, Retry restarts one that died. The partial on
             *  disk is untouched either way, so a retry resumes from it. */
            AsyncFunction("retryDownload") Coroutine { downloadId: String ->
                if (store.get(downloadId) == null) throw CodedException("no such download")
                store.mutate(downloadId) {
                    it.copy(
                        status = DownloadState.QUEUED,
                        error = null,
                        errorCode = null,
                    )
                }
                val record = store.get(downloadId)
                scheduler.schedule(downloadId, record?.totalBytes ?: record?.expectedTotal ?: 0L)
            }

            AsyncFunction("cancelDownload") Coroutine { downloadId: String ->
                scheduler.cancelRunners(downloadId)
                store.get(downloadId)?.let { record ->
                    // Cancel abandons the partial; a paused download keeps it.
                    runCatching { File(record.destination).delete() }
                }
                store.mutate(downloadId) { it.copy(status = DownloadState.CANCELLED) }
            }

            /** Drop a record entirely. Cancel and completion mark a row
             *  terminal, but terminal is not the same as forgotten: without
             *  this the table grows one row per download forever, and every
             *  cold start re-reads all of it. */
            val forgetBlock: suspend (String) -> Unit = { downloadId ->
                store.delete(downloadId)
            }
            AsyncFunction("forgetDownload") Coroutine forgetBlock

            /** The contract, not the optimisation: every non-terminal record,
             *  read from the same store the worker writes. This is what JS
             *  calls after a cold start to find work it never saw. */
            // Same reified-overload ambiguity as startDownload: an untyped lambda can
            // match `suspend () -> R` or `suspend (P0) -> R`. Naming the
            // block's type resolves it.
            val activeBlock: suspend () -> List<Map<String, Any?>> = {
                store.all().map { it.toWritableMap() }
            }
            AsyncFunction("getActiveDownloads") Coroutine activeBlock

            /** Await the terminal state of one download. Used by the retry
             *  path so JS does not have to poll on a timer. */
            OnStartObserving {
                // Re-emit whatever the store already holds. Without this, a
                // download that completed while JS was dead produces no event
                // at all and the UI silently disagrees with the disk.
                scope?.launch {
                    store
                        .all()
                        .filterNot { isTerminal(it) }
                        .forEach { sendEvent(EVENT, it.toWritableMap()) }
                }
                // Then keep pushing: the worker writes progress to the same
                // table once a second, so this Flow is the transfer's own
                // heartbeat. Polling from JS stays the CONTRACT (emitNative
                // returns early when the JS object is gone, which is exactly
                // the case a background download exists for) — these events
                // are the fast path on top of it, never the only path.
                //
                // Terminal states are pushed too (parity with PocketPal's
                // onDownloadComplete/onDownloadFailed): without them the card
                // sits for up to a second after the worker finishes. The
                // replay above stays filtered on purpose — re-announcing rows
                // from a previous session would re-run the store's completion
                // block for downloads that finished long ago. JS dedupes the
                // event/poll double-delivery (claimTerminal in
                // lib/models/download-jobs.ts).
                observeJob?.cancel()
                observeJob =
                    scope?.launch {
                        store.observeAll().collect { records ->
                            records.forEach {
                                sendEvent(EVENT, it.toWritableMap())
                            }
                        }
                    }
            }

            // Cancels the COLLECTOR ONLY. An earlier version of this module
            // called cancelAllWorkByTag here, which read like cleanup but
            // would have killed live downloads whenever JS tore down — the
            // exact opposite of what this module is for.
            OnStopObserving {
                observeJob?.cancel()
                observeJob = null
            }
        }

    private fun DownloadEntity.toWritableMap(): Map<String, Any?> =
        mapOf(
            "id" to id,
            "modelId" to modelId,
            "fileName" to fileName,
            "destinationPath" to destination,
            "expectedTotal" to expectedTotal,
            "state" to status.name.lowercase(),
            "downloadedBytes" to downloadedBytes,
            "error" to error,
            "errorCode" to errorCode,
        )

    private companion object {
        const val EVENT = "onDownloadEvent"
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
