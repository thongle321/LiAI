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

    private companion object {
        const val ID = "download-1"
    }
}
