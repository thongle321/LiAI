package com.anonymous.liai.download

import kotlinx.coroutines.delay
import kotlin.math.min

/**
 * The attempt loop (ticket 04, ported from pocketpal-ai's DownloadEngine
 * `Transfer.run`). Owns transient retry policy — backoff, stall accounting —
 * while the worker owns one attempt of HTTP + row writes.
 *
 * Kept pure loop-over-lambdas on purpose: a run is "attempt until a terminal
 * outcome", and everything environmental (clock, sleep, reads, row writes)
 * arrives as a callback. That is what makes the loop testable without a
 * database, a server, or a Robolectric runtime.
 *
 * Deliberate divergence from the reference: a plain transient keeps the row
 * RUNNING and retries in-process — it never writes a QUEUED/error mid-run.
 * QUEUED reschedules happen only at give-up (endTransientRun), preserving
 * LiAI's QUEUED-requeue discipline: the row never reads FAILED while the run
 * can still be re-run.
 */
sealed interface Attempt {
    /** The attempt transferred and verified the whole file. */
    data object Finished : Attempt

    /** The user stopped, or the row left RUNNING under us. Bytes are kept. */
    data object Stopped : Attempt

    /** Repairable failure. [bytesWritten] is the NET new bytes this attempt
     *  produced — the engine reads progress out of it (backoff reset, stall
     *  healing); [reason] is the copy a reschedule would show. */
    data class Transient(val reason: String, val bytesWritten: Long) : Attempt

    /** Our local copy no longer matches the remote (ticket 03): the attempt
     *  deleted it; retry once, then declare the remote changed. */
    data object Restart : Attempt

    /** Permanent failure; the attempt already wrote the row. */
    data class Failed(val message: String) : Attempt
}

sealed interface End {
    data object Completed : End
    data object Stopped : End

    /** Terminal failure — [failStalled] (stall) or the attempt wrote the row. */
    data class Failed(val message: String) : End

    /** Too long without bytes: the row was rescheduled QUEUED; WorkManager
     *  owns the next run. */
    data class Rescheduled(val reason: String) : End
}

class DownloadEngine(
    private val clock: () -> Long = { System.currentTimeMillis() },
    /** Called with the full backoff amount; the worker's implementation
     *  sleeps in 250 ms stop-aware steps so a pause does not sit out 30 s. */
    private val sleeper: suspend (Long) -> Unit = { delay(it) },
) {
    suspend fun run(
        stopped: () -> Boolean,
        stalledRuns: suspend () -> Int,
        attempt: suspend () -> Attempt,
        /** Writes the reschedule QUEUED and returns whether the row claimed
         *  it (a RUNNING row can be cancelled under the write). */
        reschedule: suspend (reason: String, stalledRuns: Int) -> Boolean,
        failStalled: suspend () -> Unit,
    ): End {
        var restarted = false
        var backoffMs = INITIAL_BACKOFF_MS
        var bytesAtLastFailure = 0L
        var lastByteAt = clock()
        while (true) {
            if (stopped()) return End.Stopped
            when (val outcome = attempt()) {
                is Attempt.Finished -> return End.Completed
                Attempt.Stopped -> return End.Stopped
                is Attempt.Failed -> return End.Failed(outcome.message)
                Attempt.Restart -> {
                    // One Restart is the normal "server reset the range"
                    // recovery. A second means the remote keeps changing
                    // under us — retrying is how a truncated GGUF ships.
                    if (restarted) return End.Failed(REMOTE_CHANGED_ERROR)
                    restarted = true
                }
                is Attempt.Transient -> {
                    // Reference order (DownloadEngine.kt:131-156): progress
                    // resets the curve, THEN the give-up check, THEN sleep.
                    if (outcome.bytesWritten > bytesAtLastFailure) {
                        backoffMs = INITIAL_BACKOFF_MS
                        // Fresh bytes re-anchor the stall clock — but only
                        // MARGINAL progress: an attempt that re-wrote the
                        // same offset it stalled at last time is still
                        // stalled, and a hang would otherwise never be
                        // seen as one.
                        lastByteAt = clock()
                    }
                    bytesAtLastFailure = outcome.bytesWritten

                    if (clock() - lastByteAt >= GIVE_UP_AFTER_MS) {
                        // A stalled run counts only when it wrote nothing:
                        // any fresh byte the attempt produced proves the
                        // connection is alive and heals the counter.
                        val runs = if (outcome.bytesWritten > 0) 0 else stalledRuns() + 1
                        if (runs >= MAX_STALLED_RUNS) {
                            failStalled()
                            return End.Failed(STALLED_ERROR)
                        }
                        // The write can lose a race to a pause or cancel
                        // (row-count contract); a row the user just stopped
                        // must not be resurrected QUEUED — quietly end.
                        if (reschedule(outcome.reason, runs)) return End.Rescheduled(outcome.reason)
                        return End.Stopped
                    }

                    sleeper(backoffMs)
                    backoffMs = min(backoffMs * 2, MAX_BACKOFF_MS)
                }
            }
        }
    }

    companion object {
        const val INITIAL_BACKOFF_MS = 2_000L
        const val MAX_BACKOFF_MS = 30_000L
        const val SLEEP_STEP_MS = 250L
        /** No byte for 120 s: this connection is a black hole. */
        const val GIVE_UP_AFTER_MS = 120_000L
        const val MAX_STALLED_RUNS = 5
        const val STALLED_ERROR = "Download stalled: no data received"
        const val REMOTE_CHANGED_ERROR = "Remote file changed during download"

        /** Sleep [totalMs] in stop-aware [SLEEP_STEP_MS] chunks. A full
         *  `delay(totalMs)` would make a pause sit out up to 30 s before
         *  anything reacts; stepping bounds that to 250 ms. The delay is
         *  itself injectable for tests. */
        suspend fun steppedSleep(
            totalMs: Long,
            stopped: () -> Boolean,
            sleep: suspend (Long) -> Unit = { delay(it) },
        ) {
            var remaining = totalMs
            while (remaining > 0 && !stopped()) {
                val step = min(remaining, SLEEP_STEP_MS)
                sleep(step)
                remaining -= step
            }
        }
    }
}
