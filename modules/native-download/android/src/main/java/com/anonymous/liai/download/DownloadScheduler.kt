package com.anonymous.liai.download

import android.content.Context
import android.util.Log
import androidx.annotation.RequiresApi
import androidx.work.ExistingWorkPolicy
import androidx.work.WorkManager
import android.app.job.JobInfo
import android.app.job.JobScheduler
import android.content.ComponentName
import android.os.Build
import android.os.PersistableBundle
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.coroutines.suspendCoroutine

/**
 * Where a download is handed to the OS (ticket 06, ported from pocketpal-ai
 * DownloadScheduler.kt). On API 34+ the transfer is scheduled FIRST as a
 * JobScheduler user-initiated job — there is no WorkManager ten-minute cap
 * there because the system owns the run — and only falls back to
 * WorkManager when the scheduler refuses (the app is backgrounded at
 * schedule time, quota exhausted, ...). The foreground service stays: it is
 * exactly this virtual situation on older APIs.
 *
 * The ports ([UidtPort], [WorkPort]) exist so the scheduler is testable
 * without a real JobScheduler: the suites drive it through fakes (reference
 * DownloadSchedulerTest). Production defaults are wired below.
 */
interface RunnerScheduler {
    suspend fun schedule(
        downloadId: String,
        totalBytes: Long,
        progressIntervalMs: Long = DownloadWorker.PROGRESS_INTERVAL_MS,
    )

    suspend fun cancelRunners(downloadId: String)

    suspend fun hasRunner(downloadId: String): Boolean
}

interface UidtPort {
    fun schedule(job: JobInfo): Int

    fun cancel(jobId: Int)

    fun isPending(jobId: Int): Boolean
}

interface WorkPort {
    fun enqueue(downloadId: String, progressIntervalMs: Long)

    suspend fun cancel(downloadId: String)

    suspend fun hasUnfinished(downloadId: String): Boolean
}

/** The yesterday path, byte-for-byte what NativeDownloadModule used to do
 *  inline: unique work REPLACE with the CONNECTED constraint and WorkManager's
 *  own backoff floor. Not replaced — REUSED: the fallback must behave the
 *  same as every earlier ticket's transfer. */
class WorkManagerPort(context: Context) : WorkPort {
    private val workManager = WorkManager.getInstance(context)

    override fun enqueue(downloadId: String, progressIntervalMs: Long) {
        workManager.enqueueUniqueWork(
            DownloadScheduler.workName(downloadId),
            ExistingWorkPolicy.REPLACE,
            DownloadWorker.createWorkRequest(downloadId, progressIntervalMs),
        )
    }

    override suspend fun cancel(downloadId: String) {
        workManager.cancelUniqueWork(DownloadScheduler.workName(downloadId))
    }

    override suspend fun hasUnfinished(downloadId: String): Boolean =
        workManager.getWorkInfosForUniqueWork(DownloadScheduler.workName(downloadId)).await()
            .any { !it.state.isFinished }
}

/** Suspend on a WorkManager ListenableFuture. Hand-rolled because the
 *  concurrent-futures-ktx `await` the reference imports is not on this
 *  module's classpath and one more androidx dependency buys nothing: guava
 *  (and so `addListener`) already ships through work-runtime. */
private suspend fun <T> com.google.common.util.concurrent.ListenableFuture<T>.await(): T =
    suspendCoroutine { cont ->
        addListener(
            {
                try {
                    cont.resume(get())
                } catch (e: Exception) {
                    cont.resumeWithException(e)
                }
            },
            // directExecutor's own one liner: run the completion on whatever
            // thread the future finished on.
            { it.run() },
        )
    }

@RequiresApi(34)
class JobSchedulerUidt(private val context: Context) : UidtPort {
    private val jobs: JobScheduler by lazy {
        context.getSystemService(JobScheduler::class.java).forNamespace(NAMESPACE)
    }

    override fun schedule(job: JobInfo): Int = jobs.schedule(job)

    override fun cancel(jobId: Int) = jobs.cancel(jobId)

    override fun isPending(jobId: Int): Boolean = jobs.getPendingJob(jobId) != null

    companion object {
        const val NAMESPACE = "downloads"
    }
}

class DownloadScheduler(
    private val context: Context,
    private val runs: DownloadRuns,
    private val uidt: UidtPort = JobSchedulerUidt(context),
    private val work: WorkPort = WorkManagerPort(context),
) : RunnerScheduler {

    override suspend fun schedule(downloadId: String, totalBytes: Long, progressIntervalMs: Long) {
        // Whatever was running for this id is done — pause, cancel, or a
        // prior incarnation this call replaces. Without this a re-enqueue
        // would leave TWO live schedulers racing one file.
        cancelRunners(downloadId)
        if (Build.VERSION.SDK_INT >= 34 && scheduleUserInitiated(downloadId, totalBytes, progressIntervalMs)) {
            return
        }
        Log.d(TAG, "Scheduling WorkManager run for $downloadId")
        work.enqueue(downloadId, progressIntervalMs)
    }

    override suspend fun cancelRunners(downloadId: String) {
        try {
            work.cancel(downloadId)
        } catch (e: Exception) {
            Log.e(TAG, "Error waiting for work cancellation of $downloadId", e)
        }
        if (Build.VERSION.SDK_INT >= 34) uidt.cancel(jobId(downloadId))
        // The in-process stop LAST, after the OS layers gave up: the signal
        // breaks the transfer's blocked read, so ordering matters only for
        // "stopped twice is fine" — which it is.
        runs.stop(downloadId)
    }

    override suspend fun hasRunner(downloadId: String): Boolean =
        runs.isActive(downloadId) ||
            (Build.VERSION.SDK_INT >= 34 && uidt.isPending(jobId(downloadId))) ||
            work.hasUnfinished(downloadId)

    @RequiresApi(34)
    private fun scheduleUserInitiated(downloadId: String, totalBytes: Long, progressIntervalMs: Long): Boolean {
        val job =
            JobInfo
                .Builder(jobId(downloadId), ComponentName(context, DownloadJobService::class.java))
                .setUserInitiated(true)
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setBackoffCriteria(UIDT_BACKOFF_MS, JobInfo.BACKOFF_POLICY_EXPONENTIAL)
                .setExtras(
                    PersistableBundle().apply {
                        putString(DownloadJobService.KEY_DOWNLOAD_ID, downloadId)
                        putLong(DownloadJobService.KEY_PROGRESS_INTERVAL, progressIntervalMs)
                    },
                ).apply { if (totalBytes > 0) setEstimatedNetworkBytes(totalBytes, JobInfo.NETWORK_BYTES_UNKNOWN.toLong()) }
                .build()
        val result =
            try {
                uidt.schedule(job)
            } catch (e: Exception) {
                Log.w(TAG, "User-initiated job refused for $downloadId", e)
                return false
            }
        Log.d(TAG, "User-initiated job for $downloadId: result $result")
        return result == JobScheduler.RESULT_SUCCESS
    }

    companion object {
        private const val TAG = "DownloadScheduler"
        private const val UIDT_BACKOFF_MS = 30_000L

        /** The unique-work name stayed what NativeDownloadModule has always
         *  used, so old references (a WorkManager row enqueued by a previous
         *  app version) keep resolving for pause/cancel. */
        fun workName(downloadId: String) = "native-download-$downloadId"

        fun jobId(downloadId: String) = downloadId.hashCode()
    }
}

