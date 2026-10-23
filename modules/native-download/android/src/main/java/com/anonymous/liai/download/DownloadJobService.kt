package com.anonymous.liai.download

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.job.JobParameters
import android.app.job.JobService
import android.content.Context
import android.os.Build
import androidx.annotation.RequiresApi
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.io.File
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap
import javax.net.ssl.SSLPeerUnverifiedException
import okhttp3.OkHttpClient

/**
 * The API 34+ host of the transfer (ticket 06, DownloadJobService analog of
 * the reference): the JobScheduler user-initiated job [DownloadScheduler]
 * schedules first. It drives the SAME [DownloadRunner] the WorkManager
 * fallback drives — the system owns the run, so WorkManager's ten-minute
 * background cap cannot apply — and answers its lifecycle the reference way:
 *
 *  - a USER stop (e.g. the user pressed "Cancel" on the notification) or an
 *    APP stop ends the run; only SYSTEM stops (timeout, quota, connectivity
 *    loss) come back with `reschedules = true`.
 *  - `jobFinished` fires at most once per jobId: [onStopJob] removes the
 *    [running] entry first, so the coroutine's `finally` cannot double-fire
 *    after the system already decided.
 *
 * Progress posts through [JobParameters.setNotification] on the same
 * dedupe-as-you-go policy `DownloadRunner.progress` already throttles to.
 * The engine's stall/reschedule outcomes map to `reschedule` booleans, so
 * this host keeps the WorkManager host's "QUEUED means something will run
 * again" promise.
 */
@RequiresApi(34)
class DownloadJobService : JobService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val running = ConcurrentHashMap<Int, Running>()

    private class Running(val signal: StopSignal) {
        var job: Job? = null
    }

    enum class StopKind { APP, USER, SYSTEM }

    override fun onStartJob(params: JobParameters): Boolean {
        val downloadId = params.extras.getString(KEY_DOWNLOAD_ID) ?: return false
        val progressInterval = params.extras.getLong(KEY_PROGRESS_INTERVAL, DownloadWorker.PROGRESS_INTERVAL_MS)
        var posted: Pair<String, Int?>? = null

        fun post(title: String, downloaded: Long, total: Long) {
            val shown = title to percent(downloaded, total)
            if (shown == posted) return
            posted = shown
            setNotification(
                params,
                downloadId.hashCode(),
                progressNotification(shown.first, shown.second),
                JOB_END_NOTIFICATION_POLICY_REMOVE,
            )
        }
        // Announce first (reference DownloadJobService): the notification must
        // exist before the first long stretch of work, not after.
        post("Model downloads", 0, 0)

        val entry = Running(DownloadRuns.process.register(downloadId))
        running[params.jobId] = entry
        entry.job =
            scope.launch {
                var reschedule = false
                try {
                    val store = DownloadStore(DownloadDatabase.get(applicationContext))
                    val record = store.get(downloadId)
                    if (record != null) {
                        val title = File(record.destination).name
                        post(title, record.downloadedBytes, record.expectedTotal)
                        val engine =
                            DownloadEngine(
                                sleeper = { ms -> DownloadEngine.steppedSleep(ms, stopped = { entry.signal.stopped }) },
                            )
                        val runner =
                            DownloadRunner(
                                store,
                                OkHttpClient(),
                                engine,
                                stopped = { entry.signal.stopped },
                                progress = { enriched -> post(title, enriched.downloadedBytes, enriched.expectedTotal) },
                                signal = entry.signal,
                                progressIntervalMs = progressInterval,
                            )
                        reschedule = runner.run(record) is End.Rescheduled
                    }
                } catch (ssl: SSLPeerUnverifiedException) {
                    // Same terminal treatment as the WorkManager host: this
                    // attempt failed with a tampering peer, not a network
                    // blip — rescheduling would spin against a server that
                    // will never verify.
                    DownloadStore(DownloadDatabase.get(applicationContext)).mutate(downloadId) {
                        it.copy(status = DownloadState.FAILED, error = ssl.message ?: "TLS peer not verified")
                    }
                } catch (io: IOException) {
                    // Mirror [DownloadWorker]'s ladder: IO the attempt could
                    // not attribute to itself is a Q drop for the system to
                    // re-run with backoff, never a FAILED row.
                    DownloadStore(DownloadDatabase.get(applicationContext)).mutate(downloadId) {
                        it.copy(status = DownloadState.QUEUED, error = io.message)
                    }
                    reschedule = true
                } catch (ce: CancellationException) {
                    // Scope teardown or an outer cancel: the finally below
                    // decides, the row is never touched (same WHY as the
                    // worker's CancellationException lane).
                    throw ce
                } catch (t: Throwable) {
                    DownloadStore(DownloadDatabase.get(applicationContext)).mutate(downloadId) {
                        it.copy(status = DownloadState.FAILED, error = t.message ?: t::class.java.simpleName)
                    }
                } finally {
                    DownloadRuns.process.unregister(downloadId, entry.signal)
                    if (running.remove(params.jobId, entry)) jobFinished(params, reschedule)
                }
            }
        return true
    }

    override fun onStopJob(params: JobParameters): Boolean {
        val kind = stopKind(params.stopReason)
        running.remove(params.jobId)?.let {
            it.signal.stop(user = kind == StopKind.USER)
            it.job?.cancel()
        }
        return reschedules(kind)
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    /** The worker's foreground builder, minus ForegroundInfo: the SAME
     *  channel, title style, and indeterminate rule, wrapped for
     *  [JobParameters.setNotification] instead. */
    private fun progressNotification(title: String, percent: Int?): Notification {
        ensureChannel()
        return NotificationCompat
            .Builder(this, DownloadWorker.CHANNEL_ID)
            .setContentTitle(title)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            // Same rule as the worker: determinate only when a total is
            // known — a percent for a chunked body would be a lie.
            .setProgress(100, percent ?: 0, percent == null)
            .build()
    }

    private fun ensureChannel() {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (manager.getNotificationChannel(DownloadWorker.CHANNEL_ID) == null) {
            manager.createNotificationChannel(
                NotificationChannel(
                    DownloadWorker.CHANNEL_ID,
                    "Model downloads",
                    NotificationManager.IMPORTANCE_LOW,
                ),
            )
        }
    }

    private fun percent(downloaded: Long, total: Long): Int? {
        if (total <= 0) return null
        return ((downloaded * 100) / total).toInt().coerceIn(0, 100)
    }

    companion object {
        // Same values the WorkManager request's input data uses, so both
        // hosts read identical extras names (reference DownloadJobService
        // keys). The scheduler writes both bundles.
        const val KEY_DOWNLOAD_ID = "download_id"
        const val KEY_PROGRESS_INTERVAL = "progress_interval"

        fun stopKind(reason: Int): StopKind =
            when (reason) {
                JobParameters.STOP_REASON_CANCELLED_BY_APP -> StopKind.APP
                JobParameters.STOP_REASON_USER -> StopKind.USER
                else -> StopKind.SYSTEM
            }

        fun reschedules(kind: StopKind): Boolean = kind == StopKind.SYSTEM
    }
}
