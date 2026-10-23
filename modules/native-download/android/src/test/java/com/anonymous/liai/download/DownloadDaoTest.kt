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
}
