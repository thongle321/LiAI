package com.anonymous.liai.download

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.work.ListenableWorker
import androidx.work.WorkerFactory
import androidx.work.WorkerParameters
import androidx.work.testing.TestListenableWorkerBuilder
import androidx.work.testing.WorkManagerTestInitHelper
import androidx.work.workDataOf
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File
import javax.net.ssl.SSLPeerUnverifiedException
import okhttp3.OkHttpClient

/** The response taxonomy the transfer enforces BEFORE a byte is written —
 *  ported from pocketpal-ai's DownloadEngineTest.kt `respond()` cases
 *  (ticket 02, .scratch/download-native-parity), driven through the REAL
 *  worker (TestListenableWorkerBuilder → doWork) against a loopback server.
 *
 *  408/429/5xx are transient (requeue + WorkManager retry); 400..499 other
 *  than 401/403 are a "Client error"; anything else is "Unexpected response";
 *  401/403 keep LiAI's richer auth copy (deliberate divergence). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class DownloadWorkerTest {
    @get:Rule
    val tmp = TemporaryFolder()

    private val context: Context = ApplicationProvider.getApplicationContext()
    private val server = stagingServer()
    private val database = DownloadDatabase.get(context)
    private val store = DownloadStore(database)
    private val destination: File by lazy { File(tmp.root, "model.gguf") }

    /** See DownloadWorker's [client] KDoc: retryOnConnectionFailure off so a
     *  single queued 408 is not re-run by OkHttp. */
    private val noRetryOnFailure: OkHttpClient = OkHttpClient.Builder()
        .retryOnConnectionFailure(false)
        .build()

    @Before
    fun setUp() {
        WorkManagerTestInitHelper.initializeTestWorkManager(context)
    }

    @After
    fun tearDown() {
        runCatching { server.shutdown() }
        val leftovers = runBlocking { store.all() }
        runBlocking { leftovers.forEach { store.delete(it.id) } }
        destination.delete()
        File(destination.path + PART_SUFFIX).delete()
    }

    /** Seed a fresh QUEUED row wired to the loopback server. */
    private suspend fun seed(
        expectedTotal: Long = 1_000,
        existingPartial: ByteArray? = null,
    ): DownloadEntity {
        if (existingPartial != null) {
            destination.parentFile?.mkdirs()
            destination.writeBytes(existingPartial)
        }
        val record = downloadRow(
            ID,
            destination.path,
            status = DownloadState.QUEUED,
            url = server.url("/model.gguf").toString(),
            expectedTotal = expectedTotal,
        )
        store.upsert(record)
        return record
    }

    /** Real clock, instant sleeper: in-process recovery does not pay a
     *  literal 2 s backoff inside the suite. */
    private val fastEngine = DownloadEngine(
        clock = { System.currentTimeMillis() },
        sleeper = { },
    )

    private fun worker(
        client: OkHttpClient = OkHttpClient(),
        engine: DownloadEngine = fastEngine,
    ): DownloadWorker =
        TestListenableWorkerBuilder<DownloadWorker>(context)
            .setInputData(workDataOf(DownloadWorker.KEY_ID to ID))
            .setWorkerFactory(object : WorkerFactory() {
                override fun createWorker(
                    appContext: Context,
                    workerClassName: String,
                    workerParameters: WorkerParameters,
                ) = DownloadWorker(appContext, workerParameters, client, engine)
            })
            .build()

    private suspend fun row(): DownloadEntity = store.get(ID)!!

    // --- Transient lane (in-process, ticket 04) ----------------------------

    @Test
    fun aTimeoutRecoveringIntoAnHonestResponseCompletesInsideOneRun() = runBlocking {
        seed()
        server.enqueue(MockResponse().setResponseCode(408).setBody("timeout"))

        // noRetryOnFailure: the default client transparently re-runs a 408
        // and would consume queued responses before our transfer sees one.
        val content = ByteArray(1_000) { (it % 251).toByte() }
        server.enqueue(MockResponse().setResponseCode(200).setBody(okio.Buffer().write(content)))

        val result = worker(noRetryOnFailure, fastEngine).doWork()

        // The transient is handled IN-PROCESS (fast engine, no WorkManager
        // backoff): the next attempt re-requests and completes the row.
        assertEquals(ListenableWorker.Result.success(), result)
        assertEquals(DownloadState.COMPLETED, row().status)
        assertEquals(1_000L, row().downloadedBytes)
        assertEquals(2, server.requestCount)
    }

    @Test
    fun aTransientDoesNotEndTheRunSoTheNextAttemptStillWritesTheCopy() = runBlocking {
        seed()
        server.enqueue(MockResponse().setResponseCode(500).setBody("boom"))
        server.enqueue(MockResponse().setResponseCode(404).setBody("gone"))

        val result = worker().doWork()

        // The run did not stop at the 500 (old behavior: requeue +
        // Result.retry, row QUEUED "HTTP 500"): the second attempt executed
        // and its terminal copy won. Proves transients stay in the loop here.
        assertEquals(ListenableWorker.Result.failure(), result)
        assertEquals(DownloadState.FAILED, row().status)
        assertEquals("Client error: 404", row().error)
        assertEquals(2, server.requestCount)
    }

    // --- SSL terminal, never retried --------------------------------------

    @Test
    fun sslPeerVerificationFailureIsTerminalNotRetryable() = runBlocking {
        seed()
        // Reference idiom (DownloadEngineTest.kt): an interceptor stands in
        // for the TLS layer raising PeerNotVerified mid-handshake.
        val tampered = OkHttpClient.Builder()
            .addInterceptor { throw SSLPeerUnverifiedException("peer not verified") }
            .build()

        val result = worker(tampered).doWork()

        // A tampered peer is not a transient condition: requeueing would
        // spin WorkManager against a server that will never verify, so the
        // row must read FAILED with the TLS message.
        assertEquals(ListenableWorker.Result.failure(), result)
        assertEquals(DownloadState.FAILED, row().status)
        assertEquals("peer not verified", row().error)
    }

    // --- 206 Content-Range validation / 416 resolve (ticket 03) -----------

    /** QUEUED row with a partial already staged: resume truth lives in the
     *  .part file's length, so the part is the offset's source of truth. */
    private suspend fun seedPartial(
        partialSize: Int,
        adjust: (DownloadEntity) -> DownloadEntity = { it },
    ): DownloadEntity {
        destination.parentFile?.mkdirs()
        File(destination.path + PART_SUFFIX).writeBytes(ByteArray(partialSize) { (it % 251).toByte() })
        val record = downloadRow(
            ID,
            destination.path,
            status = DownloadState.QUEUED,
            url = server.url("/model.gguf").toString(),
            expectedTotal = 1_000,
            downloadedBytes = partialSize.toLong(),
        )
        store.upsert(adjust(record))
        return record
    }

    /** A 206 continuation: Content-Range (null = header omitted entirely),
     *  optional ETag, and a body the size of the stated remainder. */
    private fun continuation(
        contentRange: String?,
        etag: String? = null,
        bodySize: Int = 600,
        chunked: Boolean = false,
    ): MockResponse =
        MockResponse().apply {
            setResponseCode(206)
            if (contentRange != null) setHeader("Content-Range", contentRange)
            if (etag != null) setHeader("ETag", etag)
            val buffer = okio.Buffer().write(ByteArray(bodySize) { (it % 251).toByte() })
            if (chunked) setChunkedBody(buffer, 1) else setBody(buffer)
        }

    @Test
    fun valid206AppendsAndPersistsValidators() = runBlocking {
        seedPartial(400)
        server.enqueue(continuation("bytes 400-999/1000", etag = "abc"))

        val result = worker(noRetryOnFailure).doWork()

        // The appended part completes the row, AND the response's validator
        // pair is adopted for later resumes (reference respond() 231-235).
        assertEquals(ListenableWorker.Result.success(), result)
        assertEquals(DownloadState.COMPLETED, row().status)
        assertEquals(1_000L, row().downloadedBytes)
        assertEquals(1_000L, row().totalBytes)
        assertEquals("abc", row().etag)
        assertEquals(1, server.requestCount)
    }

    @Test
    fun wrongStartRestartsOnceThenFails() = runBlocking {
        seedPartial(400)
        server.enqueue(continuation("bytes 500-999/1000", etag = "abc"))
        // After the restart the offset is 0 again; still misaligned — the
        // engine's single-Restart guard turns the second one terminal.
        server.enqueue(continuation("bytes 500-999/1000", etag = "abc"))

        val result = worker(noRetryOnFailure).doWork()

        assertEquals(ListenableWorker.Result.failure(), result)
        assertEquals(DownloadState.FAILED, row().status)
        assertEquals("Remote file changed during download", row().error)
        assertEquals(null, row().etag)
        assertEquals(0L, row().downloadedBytes)
        assertEquals(2, server.requestCount)
        assertEquals(false, destination.exists())
    }

    @Test
    fun mismatchedTotalRestartsOnceThenFails() = runBlocking {
        seedPartial(400) { it.copy(totalBytes = 2_000) }
        // rangeTotal 1000 != the row's pinned totalBytes 2000.
        server.enqueue(continuation("bytes 400-999/1000", etag = "abc"))
        server.enqueue(continuation("bytes 500-999/1000", etag = "abc"))

        val result = worker(noRetryOnFailure).doWork()

        assertEquals(ListenableWorker.Result.failure(), result)
        assertEquals(DownloadState.FAILED, row().status)
        assertEquals("Remote file changed during download", row().error)
        // The restart cleared the validator pin for the cold retry.
        assertEquals(null, row().totalBytes)
        assertEquals(2, server.requestCount)
    }

    @Test
    fun mismatchedEtagRestartsOnceThenFails() = runBlocking {
        seedPartial(400) { it.copy(etag = "abc") }
        server.enqueue(continuation("bytes 400-999/1000", etag = "different"))
        server.enqueue(continuation("bytes 500-999/1000", etag = "different"))

        val result = worker(noRetryOnFailure).doWork()

        assertEquals(ListenableWorker.Result.failure(), result)
        assertEquals(DownloadState.FAILED, row().status)
        assertEquals("Remote file changed during download", row().error)
        assertEquals(2, server.requestCount)
    }

    @Test
    fun malformedContentRangeRestartsOnceThenFails() = runBlocking {
        seedPartial(400)
        // Malformed header: no parseable total. A wholly missing header is
        // the same code path (header()?.let { matchEntire } → null).
        server.enqueue(continuation("bytes 400-999", etag = "abc"))
        server.enqueue(continuation("bytes 500-999/1000", etag = "abc"))

        val result = worker(noRetryOnFailure).doWork()

        assertEquals(ListenableWorker.Result.failure(), result)
        assertEquals(DownloadState.FAILED, row().status)
        assertEquals("Remote file changed during download", row().error)
        assertEquals(2, server.requestCount)
    }

    @Test
    fun fourSixteenCompletesTheFullPart() = runBlocking {
        // The part is already the whole file on disk; the server refusing our
        // out-of-bounds offset is the finish signal, not a failure.
        seedPartial(1_000)
        server.enqueue(
            MockResponse()
                .setResponseCode(416)
                .setHeader("Content-Range", "bytes */1000"),
        )

        val result = worker(noRetryOnFailure).doWork()

        assertEquals(ListenableWorker.Result.success(), result)
        assertEquals(DownloadState.COMPLETED, row().status)
        assertEquals(1_000L, row().downloadedBytes)
        assertEquals(1_000L, row().totalBytes)
        assertEquals(1, server.requestCount)
    }

    @Test
    fun fourSixteenUnderTotalRestartsOnceThenFails() = runBlocking {
        seedPartial(400)
        // headerTotal 1000 != offset 400: the part no longer lines up —
        // restart, then a still-wrong continuation trips the guard.
        server.enqueue(
            MockResponse()
                .setResponseCode(416)
                .setHeader("Content-Range", "bytes */1000"),
        )
        server.enqueue(continuation("bytes 500-999/1000", etag = "abc"))

        val result = worker(noRetryOnFailure).doWork()

        assertEquals(ListenableWorker.Result.failure(), result)
        assertEquals(DownloadState.FAILED, row().status)
        assertEquals("Remote file changed during download", row().error)
        assertEquals(2, server.requestCount)
    }

    @Test
    fun chunked206AdoptsEtagAndCompletes() = runBlocking {
        seedPartial(400)
        // A chunked continuation announces no total ("*/"): Content-Length
        // is -1 and must never be mistaken for the remainder (chunked is the
        // audit-fix case). The catalog's size carries completion.
        server.enqueue(continuation("bytes 400-999/*", etag = "abc", chunked = true))

        val result = worker(noRetryOnFailure).doWork()

        assertEquals(ListenableWorker.Result.success(), result)
        assertEquals(DownloadState.COMPLETED, row().status)
        assertEquals(1_000L, row().downloadedBytes)
        assertEquals("abc", row().etag)
        assertEquals(1, server.requestCount)
    }

    // --- Client copy ------------------------------------------------------

    @Test
    fun clientErrorsCarryTheReferenceCopy() = runBlocking {
        seed()
        server.enqueue(MockResponse().setResponseCode(402).setBody("pay me"))

        val result = worker().doWork()

        assertEquals(ListenableWorker.Result.failure(), result)
        assertEquals(DownloadState.FAILED, row().status)
        assertEquals("Client error: 402", row().error)
    }

    @Test
    fun notFoundCarriesTheReferenceCopy() = runBlocking {
        seed()
        server.enqueue(MockResponse().setResponseCode(404).setBody("gone"))

        val result = worker().doWork()

        assertEquals(ListenableWorker.Result.failure(), result)
        assertEquals(DownloadState.FAILED, row().status)
        assertEquals("Client error: 404", row().error)
    }

    // --- Unexpected response ----------------------------------------------

    @Test
    fun unexpectedStatusesCarryTheReferenceCopy() = runBlocking {
        seed()
        // 3xx with no Location: OkHttp returns the redirect as-is, and —
        // unlike the reference engine's "Unexpected response" catch-all —
        // LiAI's worker today flat-fails "HTTP 302".
        server.enqueue(MockResponse().setResponseCode(302))

        val result = worker().doWork()

        assertEquals(ListenableWorker.Result.failure(), result)
        assertEquals(DownloadState.FAILED, row().status)
        assertEquals("Unexpected response: 302", row().error)
    }

    // --- Deliberate divergences kept ---------------------------------------

    @Test
    fun rejectedTokenFailsWithTheAuthCopy() = runBlocking {
        seed()
        server.enqueue(MockResponse().setResponseCode(401).setBody("no"))

        val result = worker().doWork()

        assertEquals(ListenableWorker.Result.failure(), result)
        assertEquals(DownloadState.FAILED, row().status)
        assertEquals("Hugging Face rejected your token — check it in Settings, then Retry", row().error)
        assertEquals("authentication", row().errorCode)
    }

    @Test
    fun gatedRepoFailsWithTheTermsCopy() = runBlocking {
        seed()
        server.enqueue(MockResponse().setResponseCode(403).setBody("gated"))

        val result = worker().doWork()

        assertEquals(ListenableWorker.Result.failure(), result)
        assertEquals(DownloadState.FAILED, row().status)
        assertEquals("Your Hugging Face account can't read this repo — accept its terms on huggingface.co, then Retry", row().error)
        assertEquals(null, row().errorCode)
    }

    // --- Guard: the happy path still completes -----------------------------

    @Test
    fun honestResponseCompletes() = runBlocking {
        seed()
        val content = ByteArray(1_000) { (it % 251).toByte() }
        val buffer = okio.Buffer().write(content)
        server.enqueue(MockResponse().setResponseCode(200).setBody(buffer))

        val result = worker().doWork()

        assertEquals(ListenableWorker.Result.success(), result)
        assertEquals(DownloadState.COMPLETED, row().status)
        assertEquals(1_000L, row().downloadedBytes)
    }

    // --- .part staging + atomic commit (ticket 05) ------------------------
    //
    // In-flight bytes land at destination + ".part" (PART_SUFFIX) and the
    // final path appears by rename at commit — a right-length wrong-contents
    // GGUF is now impossible, and a completed download is never a half file.

    @Test
    fun successRenamesThePartIntoPlace() = runBlocking {
        seed()
        val content = ByteArray(1_000) { (it % 251).toByte() }
        server.enqueue(okio.Buffer().write(content).let { r -> MockResponse().setResponseCode(200).setBody(r) })

        val result = worker().doWork()

        assertEquals(ListenableWorker.Result.success(), result)
        assertEquals(DownloadState.COMPLETED, row().status)
        // The final path holds the whole file; nothing is parked at ".part".
        assertTrue("final file must exist", destination.exists())
        assertEquals(1_000L, destination.length())
        assertFalse("no .part residue", File(destination.path + PART_SUFFIX).exists())
    }

    @Test
    fun inFlightBytesSitAtThePartPathNotTheFinal() = runBlocking {
        // A size mismatch: the row's committed total is 2_000 but only
        // 600 more bytes arrive, so the failed commit must leave NO final
        // file and no part residue — whatever was written existed only at
        // the part path.
        seedPartial(400, adjust = { it.copy(totalBytes = null) })
        server.enqueue(
            continuation(contentRange = "bytes 400-999/2000", etag = "abc"),
        )

        val result = worker().doWork()

        assertEquals(ListenableWorker.Result.failure(), result)
        assertEquals("Downloaded file size does not match the expected size", row().error)
        // The bogus part is deleted by the failed commit...
        assertFalse(File(destination.path + PART_SUFFIX).exists())
        // ...and the final path never came into existence.
        assertFalse(destination.exists())
    }

    // --- adopt(): reconcile disk with the row at run start ----------------

    @Test
    fun adoptResumesFromAnExistingPartWithoutCallingTheFinal() = runBlocking {
        destination.parentFile?.mkdirs()
        File(destination.path + PART_SUFFIX).writeBytes(ByteArray(400) { (it % 251).toByte() })
        seed()

        server.enqueue(
            continuation(contentRange = "bytes 400-999/1000", etag = "abc"),
        )

        val result = worker().doWork()

        assertEquals(ListenableWorker.Result.success(), result)
        assertEquals(DownloadState.COMPLETED, row().status)
        assertEquals(1_000L, row().downloadedBytes)
        assertEquals(1, server.requestCount)
    }

    @Test
    fun adoptSupersedesWhenANewerCompletedRowOwnsTheDestination() = runBlocking {
        destination.parentFile?.mkdirs()
        destination.writeBytes(ByteArray(700) { (it % 251).toByte() })
        val record = seed()
        store.upsert(record.copy(createdAt = 1_000))
        // A newer finished download already owns this path: our run lost.
        store.upsert(
            downloadRow("newer", destination.path, status = DownloadState.COMPLETED).copy(
                createdAt = 2_000,
                downloadedBytes = 1_000,
            ),
        )

        val result = worker().doWork()

        assertEquals(ListenableWorker.Result.success(), result)
        assertEquals(DownloadState.CANCELLED, row().status)
        assertEquals(0, server.requestCount)
    }

    @Test
    fun adoptRemovesAnInPlaceFileOfUnknownSize() = runBlocking {
        destination.parentFile?.mkdirs()
        destination.writeBytes(ByteArray(700) { (it % 251).toByte() })
        // No validator known: the in-place file is unverifiable garbage.
        val record = seed().copy(totalBytes = null, etag = null, ifRange = null)
        store.upsert(record)

        val content = ByteArray(1_000) { (it % 251).toByte() }
        server.enqueue(MockResponse().setResponseCode(200).setBody(okio.Buffer().write(content)))

        val result = worker().doWork()

        assertEquals(ListenableWorker.Result.success(), result)
        assertEquals(DownloadState.COMPLETED, row().status)
        assertTrue(destination.exists())
        assertEquals(1_000L, destination.length())
    }

    @Test
    fun adoptCompletesAnExactSizeFinalFile() = runBlocking {
        destination.parentFile?.mkdirs()
        destination.writeBytes(ByteArray(1_000) { (it % 251).toByte() })
        val record = seed().copy(totalBytes = 1_000L)
        store.upsert(record)

        val result = worker().doWork()

        assertEquals(ListenableWorker.Result.success(), result)
        assertEquals(DownloadState.COMPLETED, row().status)
        assertEquals(1_000L, row().downloadedBytes)
        assertEquals(0, server.requestCount)
    }

    @Test
    fun adoptMovesAnInPlacePartialAsideAndResumes() = runBlocking {
        destination.parentFile?.mkdirs()
        destination.writeBytes(ByteArray(400) { (it % 251).toByte() })
        // The old run stopped with the file at its final path and the total
        // already known — adopt() parks it at the part path and resumes.
        val record = seed().copy(totalBytes = 1_000L)
        store.upsert(record)

        server.enqueue(continuation(contentRange = "bytes 400-999/1000", etag = "abc"))

        val result = worker().doWork()

        assertEquals(ListenableWorker.Result.success(), result)
        assertEquals(DownloadState.COMPLETED, row().status)
        assertEquals(1_000L, row().downloadedBytes)
        assertTrue(destination.exists())
        assertFalse(File(destination.path + PART_SUFFIX).exists())
    }

    private companion object {
        const val ID = "download-1"
    }
}
