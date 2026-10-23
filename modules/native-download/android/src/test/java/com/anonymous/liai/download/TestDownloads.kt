package com.anonymous.liai.download

import android.content.Context
import androidx.room.Room
import androidx.sqlite.driver.bundled.BundledSQLiteDriver
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer

/** Shared fixtures for the native download suites (ticket 01,
 *  .scratch/download-native-parity) — ported from pocketpal-ai's
 *  TestDownloads.kt and adapted to LiAI's entity.
 *
 *  One purpose: every suite in tickets 02-05 builds its Room store and its
 *  fake HTTP destination through these helpers, so the stores under test are
 *  literally interchangeable and the suites stay focused on behavior. */

/** In-memory Room with the bundled SQLite driver: no emulator, no disk, and
 *  a clean database per call. Room 2.7 runs without the native sqlite that
 *  Robolectric would otherwise have to supply. */
fun inMemoryDatabase(context: Context): DownloadDatabase =
    Room.inMemoryDatabaseBuilder(context, DownloadDatabase::class.java)
        .setDriver(BundledSQLiteDriver())
        .build()

/** A row shaped like the JS `startDownload` upsert actually writes one:
 *  modelId so a record maps back to a card, headers including the optional
 *  Bearer (kept off disk only when the row is gone), and a quoted If-Range
 *  when a resume validator is known. */
fun downloadRow(
    id: String,
    destination: String,
    status: DownloadState = DownloadState.QUEUED,
    modelId: String = "model-1",
    url: String = "https://huggingface.co/x/resolve/main/model.gguf",
    fileName: String = "model.gguf",
    expectedTotal: Long = 1_000,
    downloadedBytes: Long = 0,
    error: String? = null,
    errorCode: String? = null,
    ifRange: String? = null,
    headers: Map<String, String> = emptyMap(),
) = DownloadEntity(
    id = id,
    modelId = modelId,
    url = url,
    fileName = fileName,
    destination = destination,
    expectedTotal = expectedTotal,
    downloadedBytes = downloadedBytes,
    status = status,
    error = error,
    errorCode = errorCode,
    ifRange = ifRange,
    headers = headers,
)

/** A started loopback HTTP server the suites stand up per test. Never a
 *  singleton: MockWebServer owns its thread and must be shut down by the
 *  suite that started it (`server.shutdown()` in @After). */
fun stagingServer(): MockWebServer = MockWebServer().apply { start() }

fun MockWebServer.enqueueBody(body: String, status: Int = 200) {
    enqueue(
        MockResponse()
            .setResponseCode(status)
            .setBody(body),
    )
}
