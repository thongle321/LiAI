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
import kotlinx.coroutines.CancellationException
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
import javax.net.ssl.SSLPeerUnverifiedException
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
 *  - [DownloadEntity.expectedTotal] starts as the catalog's size, then
 *    adopts the RESPONSE's total the way PocketPal does
 *    (pocketpal-ai DownloadWorker.kt:176-194): fresh 200 -> Content-Length,
 *    206 -> existing + Content-Length. Content-Length on a 206 is the
 *    remainder, so it is never trusted bare. A chunked/Xet response reports
 *    -1 and keeps the catalog value.
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
            run(record)
        } catch (ssl: SSLPeerUnverifiedException) {
            // A tampering peer is not a network blip: requeueing would spin
            // WorkManager against a server that will never verify. Fail the
            // row with the TLS message instead (reference: DownloadEngine.kt
            // attempt(), 184-185). Caught BEFORE IOException, which it
            // extends — the generic requeue below would otherwise hide it.
            store.mutate(id) {
                it.copy(status = DownloadState.FAILED, error = ssl.message ?: "TLS peer not verified")
            }
            Result.failure()
        } catch (io: IOException) {
            // Backstop for IO escaping [attemptTransfer] — the engine's own
            // catch turns attempt-internal failures into transients with
            // in-process backoff. What reaches here is an IO the attempt
            // could not attribute to itself, and WorkManager retrying it is
            // the safest move left.
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
        }
    }

    /**
     * Park a row as QUEUED ahead of a WorkManager retry.
     *
     * FAILED here would be a lie: we are returning Result.retry(), so we WILL
     * be re-run. The row said "failed" while WorkManager quietly retried it,
     * and the user was shown an error for a transfer that was still going.
     * QUEUED is also what the UI already renders as "downloading".
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
     * Drive one worker run through the engine loop. The engine owns transient
     * retry policy — exponential backoff, the 120 s no-byte give-up feeding
     * [DownloadEntity.stalledRuns]; this method owns the row's moves:
     * QUEUED reschedules land via [DownloadStore.endTransientRun] (never a
     * FAILED while re-running is possible — see requeue()), and the stall
     * terminal is the one FAILED the loop can produce.
     */
    private suspend fun run(record: DownloadEntity): Result {
        // Claim the row before the engine spins: the old unconditional
        // progress write promoted QUEUED → RUNNING implicitly; now progress
        // is a RUNNING-guarded row count, so the claim must be explicit.
        // 0 here means somebody settled the row (paused/cancelled) between
        // doWork's check and this write — nothing live is left to do.
        if (store.casStatus(record.id, listOf(DownloadState.QUEUED, DownloadState.RUNNING), DownloadState.RUNNING) == 0) {
            return Result.success()
        }
        val end =
            engine.run(
                stopped = { isStopped },
                stalledRuns = { store.get(record.id)?.stalledRuns ?: 0 },
                attempt = { attemptTransfer(record) },
                reschedule = { reason, runs ->
                    // Row-count result: 0 means a pause/cancel settled the row
                    // while we were between attempts — leave it as the caller
                    // wrote it instead of resurrecting it QUEUED, and end the
                    // run as Stopped.
                    store.endTransientRun(record.id, runs, DownloadState.QUEUED, reason) > 0
                },
                failStalled = {
                    // RUNNING-guarded like every terminal write: a row settled
                    // by its caller (paused/cancelled) must not read FAILED.
                    store.casStatus(record.id, listOf(DownloadState.RUNNING), DownloadState.FAILED, DownloadEngine.STALLED_ERROR)
                },
            )
        return when (end) {
            is End.Completed -> Result.success()
            is End.Stopped -> Result.success()
            is End.Failed -> Result.failure()
            is End.Rescheduled -> Result.retry()
        }
    }

    /**
     * ONE attempt: request → status dispatch → copy bytes → verify. Returns
     * an [Attempt]; row writes for terminal outcomes happen in here, while
     * what happens next (retry, give up, reschedule) is the engine's call.
     */
    private suspend fun attemptTransfer(record: DownloadEntity): Attempt =
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

            // Byte bookkeeping for the engine's progress signals: attemptStart
            // is the resume offset this request was sent with (post
            // resume-guard, since a fresh 200 discards the offset), and
            // `written` counts absolute file bytes so the catch below can
            // report the NET new bytes an interrupted attempt produced.
            var attemptStart = 0L
            var written = 0L
            try {
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
                    attemptStart = existing
                    written = existing

                    when {
                        res.code == 401 || res.code == 403 -> {
                            val code = if (res.code == 401) "authentication" else null
                            return@withContext failAttempt(record, authMessage(res.code), code)
                        }

                        res.code == 408 || res.code == 429 || res.code in 500..599 -> {
                            // Rate limited, the server is unwell, or our request
                            // timed out (408 is OUR slowness). Transient: the
                            // engine backs off and re-attempts in-process, so
                            // the row stays RUNNING — no QUEUED write here.
                            return@withContext Attempt.Transient("HTTP ${res.code}", 0)
                        }

                        res.code == 416 -> {
                            // Our copy is longer than the server's: the file
                            // changed upstream. Delete it and fail for real —
                            // returning retry() here would leave the row saying
                            // "failed" while WorkManager quietly re-runs us.
                            dest.delete()
                            return@withContext failAttempt(record, "The file changed on the server — tap Retry", null)
                        }

                        res.code in 400..499 -> {
                            // Other client errors (402, 404, ...): no amount of
                            // retrying changes them — the request itself is the
                            // problem. The reference names these plainly
                            // ("Client error: N", DownloadEngine.kt respond());
                            // 401/403 above keep our richer auth copy instead.
                            return@withContext failAttempt(record, "Client error: ${res.code}", null)
                        }

                        res.code != 200 && res.code != 206 -> {
                            // Anything else is not a transfer condition (3xx
                            // served raw, protocol garbage): name it the way the
                            // reference does instead of a bare "HTTP N".
                            return@withContext failAttempt(record, "Unexpected response: ${res.code}", null)
                        }
                    }

                    // Everything below this line writes bytes, so the status is
                    // known good and there is nothing left to splice.
                    val append = res.code == 206 && existing > 0
                    // A body-less 200/206 is protocol garbage: it still gets a
                    // FAILED row like every other terminal lane, or the row
                    // would sit RUNNING with no copy while doWork fails.
                    val body = res.body ?: return@withContext failAttempt(record, "Empty response body", null)

                    // The server's total, not the catalog's: a file re-quantized
                    // upstream (or an LFS object that changed) would otherwise
                    // report Size mismatch forever and could never finish. The
                    // end-of-transfer check below compares against THIS value.
                    val contentLength = body.contentLength()
                    val serverTotal =
                        when {
                            // chunked/Xet: keep the catalog's size
                            contentLength <= 0 -> record.expectedTotal

                            // 206: the response is only the remainder
                            append -> existing + contentLength

                            else -> contentLength
                        }
                    if (serverTotal > 0 && serverTotal != record.expectedTotal) {
                        store.mutate(record.id) { it.copy(expectedTotal = serverTotal) }
                    }
                    val bodyStream = body.byteStream()
                    RandomAccessFile(dest, "rw").use { raf ->
                        if (append) raf.seek(existing)
                        val buffer = ByteArray(64 * 1024)
                        var lastPublish = 0L
                        while (true) {
                            if (isStopped) {
                                // Paused or cancelled from JS. Keep every byte we
                                // have; the partial is the whole point.
                                store.mutate(record.id) { it.copy(downloadedBytes = written) }
                                return@withContext Attempt.Stopped
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
                                // RUNNING-guarded row-count write: 0 means the
                                // row left RUNNING under us (a pause/cancel
                                // raced this publish) — stop rather than fight.
                                if (store.writeProgress(record.id, written, serverTotal) == 0) {
                                    return@withContext Attempt.Stopped
                                }
                                // Refresh the OS notification on the same 1 Hz
                                // cadence. It was built once before transfer(),
                                // and setProgress(indeterminate = true) ignores
                                // its percent argument — so the bar sat at 0%
                                // for a 4 GB pull while the card showed 90%.
                                setForeground(
                                    createForegroundInfo(
                                        record.copy(
                                            status = DownloadState.RUNNING,
                                            downloadedBytes = written,
                                            expectedTotal = serverTotal,
                                        ),
                                    ),
                                )
                            }
                        }
                    }

                    // Trust-but-verify. A short file that reads as complete hands
                    // the user a model that loads and misbehaves. Compared against
                    // the SERVER's total (catalog when the server reported none):
                    // a truncated fixed-length body raises an IOException from
                    // OkHttp before it reaches here.
                    val actual = if (dest.exists()) dest.length() else 0L
                    if (serverTotal > 0 && actual != serverTotal) {
                        val mismatch = "Size mismatch ($actual of $serverTotal bytes)"
                        store.mutate(record.id) {
                            it.copy(
                                status = DownloadState.FAILED,
                                downloadedBytes = actual,
                                error = mismatch,
                            )
                        }
                        return@withContext Attempt.Failed(mismatch)
                    }

                    store.mutate(record.id) {
                        it.copy(
                            status = DownloadState.COMPLETED,
                            downloadedBytes = actual,
                            expectedTotal = serverTotal,
                            error = null,
                            errorCode = null,
                        )
                    }
                    Attempt.Finished
                }
            } catch (ssl: SSLPeerUnverifiedException) {
                // Permanent by design (caught terminal in doWork): rethrow so
                // the generic IO catch below can never requeue it.
                throw ssl
            } catch (io: IOException) {
                // Network died mid-attempt (call setup, blocked read, closed
                // socket). Transient, with the net bytes this attempt moved:
                // the engine turns that into backoff / stall accounting and
                // re-attempts in-process — WorkManager retry() is no longer
                // the curve for a dead connection.
                Attempt.Transient(io.message ?: "Network error", written - attemptStart)
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

    /** Terminal lanes in one step: settle the row, then return the engine the
     *  same message as the [Attempt.Failed] payload (payload kept for
     *  [End.Failed] tests, the row copy is the user-visible one). */
    private suspend fun failAttempt(
        record: DownloadEntity,
        message: String,
        code: String?,
    ): Attempt.Failed {
        fail(record, message, code)
        return Attempt.Failed(message)
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
        const val CHANNEL_ID = "native-download"
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
