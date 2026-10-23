package com.anonymous.liai.download

import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Smoke test over the CURRENT DAO surface (ticket 01): the baseline the
 *  ticket-04 port extends with casStatus/writeProgress(int)/writeValidators/
 *  byDestination once those columns exist. Exercises the same verbs the
 *  worker and DownloadStore use today, on the in-memory bundled driver. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class DownloadDaoTest {
    private val database = inMemoryDatabase(ApplicationProvider.getApplicationContext())
    private val dao = database.downloadDao()

    @After
    fun close() = database.close()

    @Test
    fun upsertedRowsRoundTripWithHeadersAndValidators() = runBlocking {
        dao.upsert(
            downloadRow(
                "a",
                "/m/a.gguf",
                status = DownloadState.RUNNING,
                downloadedBytes = 400,
                ifRange = "\"abc\"",
                headers = mapOf("Authorization" to "Bearer faketoken"),
            ),
        )

        val row = dao.get("a")!!
        assertEquals(DownloadState.RUNNING, row.status)
        assertEquals(400L, row.downloadedBytes)
        assertEquals("\"abc\"", row.ifRange)
        // The Authorization fly-around: reading it back proves the maps
        // survive Converters without leaking between rows.
        assertEquals("Bearer faketoken", row.headers["Authorization"])
    }

    @Test
    fun aMissingRowReadsNull() = runBlocking {
        assertNull(dao.get("nobody"))
    }

    @Test
    fun updateProgressWritesBytesAndStatusTogether() = runBlocking {
        dao.upsert(downloadRow("a", "/m/a.gguf"))
        dao.updateProgress("a", 90, DownloadState.RUNNING)

        val row = dao.get("a")!!
        assertEquals(90L, row.downloadedBytes)
        assertEquals(DownloadState.RUNNING, row.status)
    }

    @Test
    fun updateStatusWritesTheFailureCopy() = runBlocking {
        dao.upsert(downloadRow("a", "/m/a.gguf"))
        dao.updateStatus("a", DownloadState.FAILED, "HTTP 403")

        val row = dao.get("a")!!
        assertEquals(DownloadState.FAILED, row.status)
        assertEquals("HTTP 403", row.error)
    }

    @Test
    fun reUpsertReplacesByPrimaryKey() = runBlocking {
        dao.upsert(downloadRow("a", "/m/a.gguf", status = DownloadState.RUNNING))
        dao.upsert(downloadRow("a", "/m/a.gguf", status = DownloadState.FAILED, error = "boom"))

        val rows = dao.all()
        assertEquals(1, rows.size)
        assertEquals(DownloadState.FAILED, rows.single().status)
        assertEquals("boom", rows.single().error)
    }

    @Test
    fun deleteRemovesTheRow() = runBlocking {
        dao.upsert(downloadRow("a", "/m/a.gguf"))
        dao.delete("a")

        assertEquals(0, dao.all().size)
    }

    @Test
    fun observeAllEmitsTheLiveRowSet() = runBlocking {
        dao.upsert(downloadRow("a", "/m/a.gguf"))
        dao.upsert(downloadRow("b", "/m/b.gguf"))

        val ids = dao.observeAll().first().map { it.id }
        assertEquals(listOf("a", "b"), ids)
    }

    @Test
    fun theTerminalCheckMatchesMemberStates() {
        for (state in DownloadState.values()) {
            assertEquals(
                "state $state",
                state == DownloadState.COMPLETED ||
                    state == DownloadState.FAILED ||
                    state == DownloadState.CANCELLED,
                isTerminal(downloadRow("a", "/m/a.gguf", status = state)),
            )
        }
    }

    // --- Ticket 04 surface (reference DownloadDao.kt semantics) ------------

    @Test
    fun casStatusClaimsARowFromAnEntryState() = runBlocking {
        dao.upsert(downloadRow("a", "/m/a.gguf"))

        val claimed = dao.casStatus(
            "a",
            entryStates = listOf(DownloadState.QUEUED, DownloadState.RUNNING),
            status = DownloadState.RUNNING,
        )

        assertEquals(1, claimed)
        assertEquals(DownloadState.RUNNING, dao.get("a")!!.status)
    }

    @Test
    fun casStatusIgnoresARowOutsideTheEntryStates() = runBlocking {
        dao.upsert(downloadRow("a", "/m/a.gguf", status = DownloadState.PAUSED))

        val claimed = dao.casStatus(
            "a",
            entryStates = listOf(DownloadState.QUEUED, DownloadState.RUNNING),
            status = DownloadState.FAILED,
            error = "late write",
        )

        // The compare-and-set is the whole point: a row the user paused is
        // invisible to a stale run trying to write a terminal state.
        assertEquals(0, claimed)
        val row = dao.get("a")!!
        assertEquals(DownloadState.PAUSED, row.status)
        assertNull(row.error)
    }

    @Test
    fun writeProgressAdvancesBytesAndHealsStalledRuns() = runBlocking {
        dao.upsert(downloadRow("a", "/m/a.gguf", status = DownloadState.RUNNING, expectedTotal = 4_000))
        dao.upsert(dao.get("a")!!.copy(stalledRuns = 2))

        val written = dao.writeProgress("a", 500, 4_000L)

        assertEquals(1, written)
        val row = dao.get("a")!!
        assertEquals(500L, row.downloadedBytes)
        assertEquals(0, row.stalledRuns)
    }

    @Test
    fun writeProgressRefusesANonRunningRow() = runBlocking {
        dao.upsert(downloadRow("a", "/m/a.gguf", status = DownloadState.PAUSED))

        val written = dao.writeProgress("a", 500, 4_000L)

        assertEquals(0, written)
        assertEquals(0L, dao.get("a")!!.downloadedBytes)
    }

    @Test
    fun writeValidatorsPinsEtagTotalAndOffset() = runBlocking {
        dao.upsert(downloadRow("a", "/m/a.gguf"))

        val written = dao.writeValidators("a", "\"abc\"", 4_000L, 100)

        assertEquals(1, written)
        val row = dao.get("a")!!
        assertEquals("\"abc\"", row.etag)
        assertEquals(4_000L, row.totalBytes)
        assertEquals(100L, row.downloadedBytes)
    }

    @Test
    fun byDestinationOrdersNewestFirst() = runBlocking {
        dao.upsert(downloadRow("a", "/m/shared.gguf").copy(createdAt = 1_000))
        dao.upsert(downloadRow("b", "/m/shared.gguf").copy(createdAt = 2_000))

        // Ticket 05's superseded-record logic walks from the newest sibling.
        assertEquals(listOf("b", "a"), dao.byDestination("/m/shared.gguf").map { it.id })
    }

    @Test
    fun endTransientRunReschedulesWithTheStallCount() = runBlocking {
        dao.upsert(downloadRow("a", "/m/a.gguf", status = DownloadState.RUNNING))

        val written = dao.endTransientRun(
            "a",
            stalledRuns = 3,
            status = DownloadState.QUEUED,
            error = "timeout",
        )

        assertEquals(1, written)
        val row = dao.get("a")!!
        assertEquals(DownloadState.QUEUED, row.status)
        assertEquals(3, row.stalledRuns)
        assertEquals("timeout", row.error)
    }

    @Test
    fun endTransientRunRefusesANonRunningRow() = runBlocking {
        // A pause settled the row first; a late reschedule must not
        // resurrect it QUEUED.
        dao.upsert(downloadRow("a", "/m/a.gguf", status = DownloadState.PAUSED))

        val written = dao.endTransientRun(
            "a",
            stalledRuns = 3,
            status = DownloadState.QUEUED,
            error = "timeout",
        )

        assertEquals(0, written)
        assertEquals(DownloadState.PAUSED, dao.get("a")!!.status)
    }
}
