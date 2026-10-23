package com.anonymous.liai.download

import okhttp3.Call
import java.util.concurrent.ConcurrentHashMap

/**
 * The stop handle one live run carries (reference DownloadRuns.kt port,
 * ticket 06). `stopped` is what the engine loop polls between attempts;
 * `userStop` distinguishes "the user paused this" from "the system took the
 * job back" — only the system kind is a reschedule. `call` is the in-flight
 * HTTP call: cancelling it is the only thing that breaks a BLOCKED socket
 * read, since `stopped` alone is only noticed between reads.
 */
class StopSignal {
    @Volatile
    var stopped = false
        private set

    @Volatile
    var userStop = false
        private set

    @Volatile
    var call: Call? = null

    fun stop(user: Boolean) {
        if (user) userStop = true
        stopped = true
        call?.cancel()
    }
}

/**
 * The process-wide registry of live runs, so a scheduler can stop a transfer
 * it did not start (a WorkManager worker or a JobService instance — the
 * system constructs both, so neither is reachable by reference).
 *
 * Each registration is independent: two runs of the same id (a GGUF and its
 * projector) stop separately, and unregistering one must not silence the
 * other. A process singleton because [DownloadScheduler.cancelRunners] has
 * to reach BOTH host kinds through one object.
 */
class DownloadRuns {
    private val signals = ConcurrentHashMap<String, Set<StopSignal>>()

    fun register(downloadId: String): StopSignal {
        val signal = StopSignal()
        signals.merge(downloadId, setOf(signal)) { live, added -> live + added }
        return signal
    }

    fun unregister(downloadId: String, signal: StopSignal) {
        signals.computeIfPresent(downloadId) { _, live -> (live - signal).ifEmpty { null } }
    }

    fun stop(downloadId: String) {
        signals[downloadId]?.forEach { it.stop(user = false) }
    }

    fun isActive(downloadId: String): Boolean = !signals[downloadId].isNullOrEmpty()

    companion object {
        val process = DownloadRuns()
    }
}
