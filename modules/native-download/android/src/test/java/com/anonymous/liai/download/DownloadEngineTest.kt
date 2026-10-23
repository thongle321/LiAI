package com.anonymous.liai.download

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** The engine attempt loop (ticket 04, .scratch/download-native-parity) —
 *  ported from pocketpal-ai's DownloadEngine Transfer.run semantics:
 *  exponential backoff 2 s → 30 s with reset-on-progress, a 120 s no-byte
 *  give-up feeding stalledRuns counting (fail at 5), and the single-Restart
 *  guard ticket 03 exercises.
 *
 *  The engine is pure loop-over-lambdas, so these tests drive a deterministic
 *  fake clock and a recording sleeper — no DB, no HTTP, no Robolectric. */
class DownloadEngineTest {
    private class Hooks {
        var clockNow = 0L
        val sleeps = mutableListOf<Long>()
        val requeueCalls = mutableListOf<Pair<String, Int>>()
        var failStalledCalls = 0
    }

    private fun engineFor(h: Hooks) = DownloadEngine(
        clock = { h.clockNow },
        sleeper = { ms -> h.sleeps.add(ms) },
    )

    /** Pending stall counter the engine reads per give-up. */
    private class Stalls(@Volatile var value: Int = 0)

    @Test
    fun transientFailuresBackOffExponentially() = runBlocking {
        val h = Hooks()
        val attempts = listOf(
            Attempt.Transient("HTTP 429", 0),
            Attempt.Transient("HTTP 500", 0),
            Attempt.Finished,
        ).toMutableList()
        val end = engineFor(h).run(
            stopped = { false },
            stalledRuns = { 0 },
            attempt = { attempts.removeAt(0) },
            reschedule = { reason, runs -> h.requeueCalls.add(reason to runs) },
            failStalled = { h.failStalledCalls++ },
        )

        assertTrue(end is End.Completed)
        // sleep(backoff) THEN double: 2 s -> 4 s. No reschedules: a plain
        // transient keeps the row RUNNING and stays in-process.
        assertEquals(listOf(2_000L, 4_000L), h.sleeps)
        assertEquals(0, h.requeueCalls.size)
        assertEquals(0, h.failStalledCalls)
    }

    @Test
    fun backoffResetsWhenBytesArrived() = runBlocking {
        val h = Hooks()
        val attempts = listOf(
            Attempt.Transient("timeout", 0),
            Attempt.Transient("timeout", 512),
            Attempt.Transient("timeout", 0),
            Attempt.Finished,
        ).toMutableList()
        engineFor(h).run(
            stopped = { false },
            stalledRuns = { 0 },
            attempt = { attempts.removeAt(0) },
            reschedule = { reason, runs -> h.requeueCalls.add(reason to runs) },
            failStalled = { h.failStalledCalls++ },
        )

        // The 512-byte attempt resets the curve; the next 0-byte one starts
        // from 2 s again and only then doubles.
        assertEquals(listOf(2_000L, 2_000L, 4_000L), h.sleeps)
    }

    @Test
    fun backoffCapsAtThirtySeconds() = runBlocking {
        val h = Hooks()
        val attempts = (List(6) { Attempt.Transient("HTTP 500", 0) } + Attempt.Finished).toMutableList()
        engineFor(h).run(
            stopped = { false },
            stalledRuns = { 0 },
            attempt = { attempts.removeAt(0) },
            reschedule = { reason, runs -> h.requeueCalls.add(reason to runs) },
            failStalled = { h.failStalledCalls++ },
        )

        assertEquals(listOf(2_000L, 4_000L, 8_000L, 16_000L, 30_000L, 30_000L), h.sleeps)
    }

    @Test
    fun oneHundredAndTwentySecondsWithoutBytesReschedulesViaWorkManager() = runBlocking {
        val h = Hooks()
        val updates = Stalls(0)
        val engine = engineFor(h)
        // Each attempt advances the fake clock a further 65 s and writes no
        // bytes. The second one crosses the 120 s give-up threshold
        // (1 attempt: 65 s -> sleeps 2 s; 2 attempts: 130 s -> give up).
        val attempts = listOf(
            { Attempt.Transient("timeout", 0).also { h.clockNow += 65_000 } },
            { Attempt.Transient("timeout", 0).also { h.clockNow += 65_000 } },
        )
        val end = engine.run(
            stopped = { false },
            stalledRuns = { updates.value },
            attempt = { attempts[0]() },
            reschedule = { reason, runs ->
                updates.value = runs
                h.requeueCalls.add(reason to runs)
            },
            failStalled = { h.failStalledCalls++ },
        )

        // GaveUp: a 0-byte run increments stalledRuns and reschedules
        // (QUEUED + WorkManager retry) — never dao.fail.
        assertTrue(end is End.Rescheduled)
        assertEquals(listOf("timeout" to 1), h.requeueCalls)
        assertEquals(1, updates.value)
        assertEquals(0, h.failStalledCalls)
    }

    @Test
    fun fiveStalledRunsFailTheRowWithTheReferenceCopy() = runBlocking {
        val h = Hooks()
        val updates = Stalls(0)
        // Repeated runs, as the WorkManager re-scheduling would produce: each
        // run immediately hits a 65 s x 2 attempt give-up with no writes.
        repeat(4) { pass ->
            val end = engineFor(h).run(
                stopped = { false },
                stalledRuns = { updates.value },
                attempt = { h.clockNow += 130_000; Attempt.Transient("timeout", 0) },
                reschedule = { reason, runs -> updates.value = runs; h.requeueCalls.add(reason to runs) },
                failStalled = { h.failStalledCalls++ },
            )
            if (pass < 3) assertTrue(end is End.Rescheduled)
        }
        // Fifth stalled run: the row fails instead of requeueing.
        val end = engineFor(h).run(
            stopped = { false },
            stalledRuns = { updates.value },
            attempt = { h.clockNow += 130_000; Attempt.Transient("timeout", 0) },
            reschedule = { reason, runs -> updates.value = runs; h.requeueCalls.add(reason to runs) },
            failStalled = { h.failStalledCalls++ },
        )

        assertTrue(end is End.Failed)
        assertEquals("Download stalled: no data received", (end as End.Failed).message)
        assertEquals(1, h.failStalledCalls)
        assertEquals(4, updates.value)
    }

    @Test
    fun singleRestartIsRetriedTwiceIsTerminal() = runBlocking {
        val h = Hooks()
        val attempts = listOf(
            Attempt.Restart,
            Attempt.Restart,
        ).toMutableList()
        val end = engineFor(h).run(
            stopped = { false },
            stalledRuns = { 0 },
            attempt = { attempts.removeAt(0) },
            reschedule = { reason, runs -> h.requeueCalls.add(reason to runs) },
            failStalled = { h.failStalledCalls++ },
        )

        // Second Restart = the remote changed underneath us mid-transfer.
        assertTrue(end is End.Failed)
        assertEquals("Remote file changed during download", (end as End.Failed).message)
        assertEquals(0, h.failStalledCalls)
    }

    @Test
    fun stoppingBeforeAnAttemptEndsWithoutTouchingTheTransfer() = runBlocking {
        val h = Hooks()
        var attemptsCalled = 0
        val end = engineFor(h).run(
            stopped = { true },
            stalledRuns = { 0 },
            attempt = { attemptsCalled++; Attempt.Finished },
            reschedule = { reason, runs -> h.requeueCalls.add(reason to runs) },
            failStalled = { h.failStalledCalls++ },
        )

        assertTrue(end is End.Stopped)
        assertEquals(0, attemptsCalled)
    }

    // --- Review-driven additions (code-review of ticket 04) ----------------

    @Test
    fun sleepStepsAreTwoFiftyMillisAndStopAware() = runBlocking {
        val h = Hooks()
        val attempts = listOf(
            Attempt.Transient("HTTP 500", 0),
            Attempt.Transient("HTTP 500", 0),
            Attempt.Finished,
        ).toMutableList()
        // The production sleeper: 250 ms chunks so a pause request never
        // waits out a whole 30 s backoff in one blocking delay.
        val engine = DownloadEngine(
            clock = { h.clockNow },
            sleeper = { total -> DownloadEngine.steppedSleep(total, stopped = { false }, sleep = { ms -> h.sleeps.add(ms) }) },
        )
        engine.run(
            stopped = { false },
            stalledRuns = { 0 },
            attempt = { attempts.removeAt(0) },
            reschedule = { reason, runs -> h.requeueCalls.add(reason to runs) },
            failStalled = { h.failStalledCalls++ },
        )

        // 2_000 ms backoff -> 8 steps; 4_000 ms -> 16 steps; every step is a
        // quarter second.
        assertEquals(24, h.sleeps.size)
        assertTrue(h.sleeps.all { it == DownloadEngine.SLEEP_STEP_MS })
    }

    @Test
    fun aRunThatWroteStaleBytesHealsTheStallCount() = runBlocking {
        val h = Hooks()
        // Attempt 1 makes marginal progress (re-anchors the byte clock);
        // attempt 2 rewrites the SAME offset — bytes moved, but not forward.
        // The reference reads that as still stalled on bytes, yet it heals
        // the pending stall count: a run that produced bytes is life.
        val attempts = listOf(
            { Attempt.Transient("timeout", 300) },
            {
                h.clockNow += 130_000
                Attempt.Transient("timeout", 300)
            },
        ).toMutableList()
        val end = engineFor(h).run(
            stopped = { false },
            stalledRuns = { 3 },
            attempt = { attempts.removeAt(0)() },
            reschedule = { reason, runs -> h.requeueCalls.add(reason to runs) },
            failStalled = { h.failStalledCalls++ },
        )

        assertTrue(end is End.Rescheduled)
        assertEquals(listOf("timeout" to 0), h.requeueCalls)
        assertEquals(0, h.failStalledCalls)
    }

    @Test
    fun aLostRescheduleRaceEndsStoppedNotRescheduled() = runBlocking {
        val h = Hooks()
        // Pause/cancel settles the row between attempt return and
        // reschedule: the guarded write reports 0 rows and the run must end
        // Stopped instead of resurrecting the row QUEUED.
        val end = engineFor(h).run(
            stopped = { false },
            stalledRuns = { 0 },
            attempt = { h.clockNow += 130_000; Attempt.Transient("timeout", 0) },
            reschedule = { _, _ -> false },
            failStalled = { h.failStalledCalls++ },
        )

        assertTrue(end is End.Stopped)
        assertEquals(0, h.requeueCalls.size)
        assertEquals(0, h.failStalledCalls)
    }
}
