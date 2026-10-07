package com.anonymous.liai.download

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.CoroutineWorker
import androidx.work.ForegroundInfo
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.job
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.IOException
import java.io.RandomAccessFile
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.coroutines.suspendCoroutine

/**
 * The transfer. Runs inside WorkManager so it outlives the app process —
 * which is the entire reason this module exists, since expo-file-system's
 * Android downloader runs on a Dispatchers.IO coroutine inside the app and
 * dies with it.
 *
 * The invariants it defends, each learned from the JS path this replaces:
 *
 *  - The file on disk is written by us, so we can see the seam. The JS path
 *    could not: expo's native writer streams the response body with no status
 *    check and appends when resuming, which let an error blob land inside a
 *    GGUF. Here every status is inspected BEFORE any byte is written.
 *  - A 200 on a resume means the server ignored our Range and sent the whole
 *    file. Appending that to a partial yields a file of the right length and
 *    the wrong contents, so the partial is dropped and the fetch restarts.
 *  - [DownloadEntity.expectedTotal] comes from the Hub, never from
 *    Content-Length, which on a 206 is the size of the remainder.
 */
class DownloadWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {
    private val store = DownloadStore(DownloadDatabase.get(applicationContext))
    private val client = OkHttpClient()

    /** The in-flight call, so a stop can break a blocked read.
     *
     *  `isStopped` is only checked BETWEEN reads, and a blocking
     *  `byteStream.read()` ignores coroutine cancellation, so without this a
     *  stalled connection makes Pause do nothing until the next byte arrives —
     *  arbitrarily long. PocketPal solves the same problem with a
     *  `handleStopped()` -> `currentCall?.cancel()` hook (DownloadWorker.kt:33),
     *  which it can afford because it uses `ListenableWorker`; `CoroutineWorker`
     *  marks `onStopped` final, so the hook lives on the coroutine instead. */
    @Volatile
    private var currentCall: okhttp3.Call? = null

    override suspend fun doWork(): Result {
        val id = inputData.getString(KEY_ID) ?: return Result.failure()
        val record = store.get(id) ?: return Result.failure()

        // Somebody already settled this one while we were queued.
        if (record.status == DownloadState.CANCELLED || record.status == DownloadState.PAUSED) {
            return Result.success()
        }

        return try {
            setForeground(createForegroundInfo(record))
            transfer(record)
        } catch (io: IOException) {
            // Network died mid-transfer. WorkManager owns the backoff, so a
            // retry here is the OS-level exponential curve, not our own.
            store.mutate(id) { it.copy(status = DownloadState.FAILED, error = io.message) }
            Result.retry()
        } catch (t: Throwable) {
            store.mutate(id) {
                it.copy(
                    status = DownloadState.FAILED,
                    error = t.message ?: t::class.java.simpleName,
                )
            }
            Result.failure()
        }
    }

    private suspend fun transfer(record: DownloadEntity): Result =
        withContext(Dispatchers.IO) {
            val dest = File(record.destination)
            dest.parentFile?.mkdirs()

            // Resume truth lives on disk, not in memory: this is exactly what
            // survives the process being killed mid-transfer.
            var existing = if (dest.exists()) dest.length() else 0L
            // A file at or past the expected size is not resumable. Too big
            // means a previous run appended something it should not have, so
            // it is discarded rather than extended.
            if (existing >= record.expectedTotal && record.expectedTotal > 0) {
                dest.delete()
                existing = 0
            }

            val request =
                Request
                    .Builder()
                    .url(record.url)
                    .apply {
                        record.headers.forEach { (k, v) -> header(k, v) }
                        if (existing > 0) {
                            header("Range", "bytes=$existing-")
                            // A bare hex oid is not a valid entity-tag and the
                            // server may ignore the whole header, leaving the
                            // splice unprotected. Quoting it is what makes the
                            // server honour it and answer 200 instead of 206.
                            record.ifRange?.let { header("If-Range", "\"$it\"") }
                        }
                    }.build()

            // WorkManager cancels this coroutine when the worker is stopped (it cancels
            // the work continuation in its own onStopped). Hooking THAT is what
            // breaks a blocked read, because cancelling the call is the only
            // thing a blocking socket read actually reacts to.
            currentCoroutineContext().job.invokeOnCompletion { currentCall?.cancel() }

            val call = client.newCall(request)
            currentCall = call
            val response =
                try {
                    call.await()
                } finally {
                    currentCall = null
                }
            response.use { res ->
                // A 200 on a resume means the server ignored our Range and is
                // sending the WHOLE file. Appending it to the partial is how a
                // right-length, wrong-contents GGUF happens, so the partial is
                // dropped and this response is written from zero. No retry:
                // the body already in hand IS the file, so re-requesting it
                // would cost a full WorkManager backoff cycle for nothing.
                if (res.code == 200 && existing > 0) {
                    dest.delete()
                    existing = 0
                    store.mutate(record.id) { it.copy(downloadedBytes = 0L) }
                }

                when {
                    res.code == 401 || res.code == 403 -> {
                        fail(record, authMessage(res.code), if (res.code == 401) "authentication" else null)
                        return@withContext Result.failure()
                    }

                    res.code == 429 || res.code in 500..599 -> {
                        store.mutate(record.id) {
                            it.copy(
                                status = DownloadState.FAILED,
                                error = "HTTP ${res.code}",
                            )
                        }
                        return@withContext Result.retry()
                    }

                    res.code == 416 -> {
                        // Our copy is longer than the server's: the file
                        // changed upstream. Delete it and fail for real —
                        // returning retry() here would leave the row saying
                        // "failed" while WorkManager quietly re-runs us.
                        dest.delete()
                        store.mutate(record.id) {
                            it.copy(
                                status = DownloadState.FAILED,
                                error = "The file changed on the server — tap Retry",
                            )
                        }
                        return@withContext Result.failure()
                    }

                    res.code != 200 && res.code != 206 -> {
                        fail(record, "HTTP ${res.code}", null)
                        return@withContext Result.failure()
                    }
                }

                // Everything below this line writes bytes, so the status is
                // known good and there is nothing left to splice.
                val append = res.code == 206 && existing > 0
                val body = res.body ?: return@withContext Result.failure()
                val bodyStream = body.byteStream()
                RandomAccessFile(dest, "rw").use { raf ->
                    if (append) raf.seek(existing)
                    val buffer = ByteArray(64 * 1024)
                    var written = if (append) existing else 0L
                    var lastPublish = 0L
                    while (true) {
                        if (isStopped) {
                            // Paused or cancelled from JS. Keep every byte we
                            // have; the partial is the whole point.
                            store.mutate(record.id) { it.copy(downloadedBytes = written) }
                            return@withContext Result.success()
                        }
                        val read = bodyStream.read(buffer)
                        if (read == -1) break
                        raf.write(buffer, 0, read)
                        written += read

                        // Throttle the durable write to ~1 Hz. The JS side
                        // reads progress once a second at most, and a write
                        // per 64 KB chunk would be ~40/s per download.
                        val now = System.currentTimeMillis()
                        if (now - lastPublish > PROGRESS_INTERVAL_MS) {
                            lastPublish = now
                            store.mutate(record.id) {
                                it.copy(
                                    status = DownloadState.RUNNING,
                                    downloadedBytes = written,
                                )
                            }
                        }
                    }
                }

                // Trust-but-verify. A short file that reads as complete hands
                // the user a model that loads and misbehaves.
                val actual = if (dest.exists()) dest.length() else 0L
                if (record.expectedTotal > 0 && actual != record.expectedTotal) {
                    store.mutate(record.id) {
                        it.copy(
                            status = DownloadState.FAILED,
                            downloadedBytes = actual,
                            error = "Size mismatch ($actual of ${record.expectedTotal} bytes)",
                        )
                    }
                    return@withContext Result.failure()
                }

                store.mutate(record.id) {
                    it.copy(
                        status = DownloadState.COMPLETED,
                        downloadedBytes = record.expectedTotal,
                        error = null,
                        errorCode = null,
                    )
                }
                Result.success()
            }
        }

    private suspend fun fail(
        record: DownloadEntity,
        message: String,
        code: String?,
    ) {
        store.mutate(record.id) {
            it.copy(
                status = DownloadState.FAILED,
                error = message,
                errorCode = code,
            )
        }
    }

    private fun authMessage(code: Int): String =
        if (code == 401) {
            "Hugging Face rejected your token — check it in Settings, then Retry"
        } else {
            "Your Hugging Face account can't read this repo — accept its terms on huggingface.co, then Retry"
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
                .setProgress(100, percent(record), true)
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
        const val STORE_NAME = "expo-downloads.json"
        const val CHANNEL_ID = "expo-download"
        const val PROGRESS_INTERVAL_MS = 1000L
    }
}

/** Suspend on an OkHttp call, cancelling the call if the coroutine is cancelled. */
private suspend fun okhttp3.Call.await(): okhttp3.Response =
    suspendCancellableCoroutine { cont ->
        enqueue(
            object : okhttp3.Callback {
                override fun onFailure(
                    call: okhttp3.Call,
                    e: IOException,
                ) {
                    if (!cont.isCancelled) cont.resumeWithException(e)
                }

                override fun onResponse(
                    call: okhttp3.Call,
                    response: okhttp3.Response,
                ) {
                    cont.resume(response)
                }
            },
        )
        cont.invokeOnCancellation {
            runCatching { cancel() }
        }
    }
