package com.anonymous.liai.download

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ForegroundInfo
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequest
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import kotlinx.coroutines.CancellationException
import okhttp3.OkHttpClient
import java.io.File
import java.io.IOException
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLPeerUnverifiedException

/**
 * The WorkManager HOST of the transfer (ticket 06 extracted the run into
 * [DownloadRunner], so this class keeps only what a WorkManager host owns:
 * the foreground promotion, the OS exception ladder, and the API-34+
 * scheduling handoff to [DownloadScheduler] — a JobScheduler user-initiated
 * job first, this worker as the fallback). The transfer mechanics, their
 * invariants, and the row writes live in [DownloadRunner], shared verbatim
 * with [DownloadJobService]; read its header for the "WHY THIS EXISTS".
 *
 * What the extraction changed: nothing behavioral. doWork drives the same
 * claim → adopt → engine loop the pre-extraction `run(record)` did, a
 * registered [StopSignal] now joins `isStopped` (so
 * [DownloadScheduler.cancelRunners] can break a blocked read), and the
 * progress interval rides the work request's input.
 */
class DownloadWorker(
    context: Context,
    params: WorkerParameters,
    /** Injectable for tests: MockWebServer suites pass a client with
     *  `retryOnConnectionFailure(false)` so a single queued response is not
     *  consumed by OkHttp's transparent 408/421 retry. Production keeps the
     *  plain client through the 2-arg constructor below — behavior is
     *  unchanged from before this parameter existed. */
    private val client: OkHttpClient = OkHttpClient(),
    /** Injectable for tests (fast engine: instant sleeper, controlled clock).
     *  Production gets the real clock and a stop-aware stepped sleeper: a
     *  pause must not sit out a 30 s backoff in one blocking delay. */
    injectedEngine: DownloadEngine? = null,
) : CoroutineWorker(context, params) {
    private val store = DownloadStore(DownloadDatabase.get(applicationContext))
    private val engine =
        injectedEngine
            ?: DownloadEngine(
                sleeper = { ms -> DownloadEngine.steppedSleep(ms, stopped = { isStopped }) },
            )

    /** The exact two-arg signature WorkManager's default WorkerFactory
     *  reflects on when the native module enqueues the request. */
    constructor(context: Context, params: WorkerParameters) : this(context, params, OkHttpClient())

    override suspend fun doWork(): Result {
        val id = inputData.getString(KEY_ID) ?: return Result.failure()
        val intervalMs = inputData.getLong(KEY_PROGRESS_INTERVAL, PROGRESS_INTERVAL_MS)
        val record = store.get(id) ?: return Result.failure()

        // Somebody already settled this one while we were queued.
        if (record.status == DownloadState.CANCELLED || record.status == DownloadState.PAUSED) {
            return Result.success()
        }

        val signal = DownloadRuns.process.register(id)
        return try {
            setForeground(createForegroundInfo(record))
            val runner =
                DownloadRunner(
                    store,
                    client,
                    engine,
                    // WorkManager-driven stop OR a stop from the scheduler
                    // layer (pause/cancel from JS break the read through the
                    // signal even if WorkManager's stop lands late).
                    stopped = { isStopped || signal.stopped },
                    progress = { enriched -> setForeground(createForegroundInfo(enriched)) },
                    signal = signal,
                    progressIntervalMs = intervalMs,
                )
            when (runner.run(record)) {
                is End.Completed, is End.Stopped -> Result.success()
                is End.Failed -> Result.failure()
                is End.Rescheduled -> Result.retry()
            }
        } catch (ssl: SSLPeerUnverifiedException) {
            // A tampering peer is not a network blip: requeueing would spin
            // the scheduler against a server that will never verify. Fail the
            // row with the TLS message instead (reference: DownloadEngine.kt
            // attempt(), 184-185). Caught BEFORE IOException, which it
            // extends — the generic requeue below would otherwise hide it.
            store.mutate(id) {
                it.copy(status = DownloadState.FAILED, error = ssl.message ?: "TLS peer not verified")
            }
            Result.failure()
        } catch (io: IOException) {
            // Backstop for IO escaping [DownloadRunner.attemptTransfer] — the
            // engine's own catch turns attempt-internal failures into
            // transients with in-process backoff. What reaches here is an IO
            // the attempt could not attribute to itself, and the scheduler
            // retrying it is the safest move left.
            requeue(id, io.message)
            Result.retry()
        } catch (ce: CancellationException) {
            // A pause or cancel from JS stops us by cancelling this
            // coroutine, which surfaces here as CancellationException — not
            // an IOException. Writing a status here would race the PAUSED /
            // CANCELLED row that the caller already wrote, and whichever lost
            // would decide what the user sees: a paused download reported as
            // failed. The caller owns this state; say nothing.
            throw ce
        } catch (t: Throwable) {
            store.mutate(id) {
                it.copy(
                    status = DownloadState.FAILED,
                    error = t.message ?: t::class.java.simpleName,
                )
            }
            Result.failure()
        } finally {
            DownloadRuns.process.unregister(id, signal)
        }
    }

    /**
     * Park a row as QUEUED ahead of a scheduler retry.
     *
     * FAILED here would be a lie: we are returning Result.retry(), so we WILL
     * be re-run. The row said "failed" while the scheduler quietly retried
     * it, and the user was shown an error for a transfer that was still
     * going. QUEUED is also what the UI already renders as "downloading".
     */
    private suspend fun requeue(
        id: String,
        reason: String?,
    ) {
        store.mutate(id) {
            it.copy(status = DownloadState.QUEUED, error = reason)
        }
    }

    /**
     * WorkManager caps a plain Worker at ten minutes, which every multi-GB
     * model exceeds. Promoting to a foreground service with a notification is
     * what lifts that cap; without it this module would be pointless for the
     * downloads it exists to support.
     */
    private fun createForegroundInfo(record: DownloadEntity): ForegroundInfo {
        val notificationManager =
            applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            notificationManager.createNotificationChannel(
                NotificationChannel(
                    CHANNEL_ID,
                    "Model downloads",
                    NotificationManager.IMPORTANCE_LOW,
                ),
            )
        }
        val notification =
            NotificationCompat
                .Builder(applicationContext, CHANNEL_ID)
                .setContentTitle("Downloading ${record.fileName}")
                .setSmallIcon(android.R.drawable.stat_sys_download)
                .setOngoing(true)
                // Determinate when a total is known: `indeterminate = true`
                // makes Android ignore the percent entirely, which is why the
                // bar used to sit still. Unknown total (chunked response with
                // no catalog size) falls back to the spinner, where a number
                // would be a lie.
                .setProgress(100, percent(record), record.expectedTotal <= 0)
                .build()
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ForegroundInfo(
                record.id.hashCode(),
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
            )
        } else {
            ForegroundInfo(record.id.hashCode(), notification)
        }
    }

    private fun percent(record: DownloadEntity): Int {
        if (record.expectedTotal <= 0) return 0
        return ((record.downloadedBytes * 100) / record.expectedTotal).toInt().coerceIn(0, 100)
    }

    companion object {
        const val KEY_ID = "download_id"
        const val KEY_PROGRESS_INTERVAL = "progress_interval"
        const val CHANNEL_ID = "native-download"
        const val PROGRESS_INTERVAL_MS = 1000L

        /** The request the WorkManager fallback path enqueues — the same
         *  shape NativeDownloadModule built inline before ticket 06 moved
         *  scheduling into [DownloadScheduler] (CONNECTED constraint and
         *  WorkManager's own backoff floor kept verbatim). Lives here, next
         *  to [DownloadWorker], because it enqueues exactly this worker. */
        fun createWorkRequest(
            downloadId: String,
            progressIntervalMs: Long = PROGRESS_INTERVAL_MS,
        ): OneTimeWorkRequest =
            OneTimeWorkRequestBuilder<DownloadWorker>()
                .setInputData(
                    workDataOf(
                        KEY_ID to downloadId,
                        KEY_PROGRESS_INTERVAL to progressIntervalMs,
                    ),
                ).setConstraints(
                    Constraints
                        .Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build(),
                ).setBackoffCriteria(
                    BackoffPolicy.EXPONENTIAL,
                    10_000L,
                    TimeUnit.MILLISECONDS,
                ).build()
    }
}
