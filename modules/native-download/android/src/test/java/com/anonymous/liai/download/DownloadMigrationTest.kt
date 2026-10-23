package com.anonymous.liai.download

import android.content.Context
import androidx.room.Room
import androidx.sqlite.driver.bundled.BundledSQLiteDriver
import androidx.sqlite.execSQL
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Migration baseline (ticket 01, .scratch/download-native-parity).
 *
 *  The v1 database is built BY HAND — the exact DDL Room generates for the
 *  current [DownloadEntity] (`version = 1, exportSchema = false`, so there
 *  is no exported schema file to load) — which is the same idiom
 *  pocketpal-ai's DownloadMigrationTest.kt:24-40 uses. Tickets 04/05 add
 *  `MIGRATION_1_2` (validator columns + stalledRuns) to DownloadDatabase and
 *  extend this suite to: rebuild the seed at user_version = 1, open with the
 *  migration attached, and assert every surviving row carries empty
 *  validators / 0 stalledRuns.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class DownloadMigrationTest {
    private val context: Context = ApplicationProvider.getApplicationContext()
    private val path = context.getDatabasePath("migration-test.db")

    @Before
    fun createVersion1Database() {
        path.parentFile!!.mkdirs()
        path.delete()
        val connection = BundledSQLiteDriver().open(path.absolutePath)
        connection.execSQL(
            "CREATE TABLE IF NOT EXISTS `downloads` (`id` TEXT NOT NULL, `modelId` TEXT NOT NULL, " +
                "`url` TEXT NOT NULL, `fileName` TEXT NOT NULL, `destination` TEXT NOT NULL, " +
                "`expectedTotal` INTEGER NOT NULL, `downloadedBytes` INTEGER NOT NULL, " +
                "`status` TEXT NOT NULL, `error` TEXT, `errorCode` TEXT, `ifRange` TEXT, " +
                "`headers` TEXT NOT NULL, PRIMARY KEY(`id`))",
        )
        // One mid-flight transfer and one done: the rows a future migration
        // must carry through untouched.
        connection.execSQL(
            insert(
                id = "in-flight",
                destination = "/models/a.gguf",
                status = "RUNNING",
                expectedTotal = 1_000,
                downloadedBytes = 400,
                ifRange = "\"abc\"",
                headers = """{"Authorization":"Bearer faketoken"}""",
            ),
        )
        connection.execSQL(
            insert(id = "done", destination = "/models/b.gguf", status = "COMPLETED", expectedTotal = 2_000, downloadedBytes = 2_000),
        )
        connection.execSQL("PRAGMA user_version = 1")
        connection.close()
    }

    @After
    fun cleanUp() {
        path.delete()
    }

    @Test
    fun rowsSurviveBeingOpenedByTheCurrentSchema() = runBlocking {
        // No addMigrations today: the shipped database IS version 1. The
        // assertion is the migration-test skeleton — the opening/build steps
        // tickets 04/05 keep, with MIGRATION_1_2 added to the builder.
        val database = Room.databaseBuilder(context, DownloadDatabase::class.java, path.absolutePath)
            .setDriver(BundledSQLiteDriver())
            .build()
        val dao = database.downloadDao()

        val inFlight = dao.get("in-flight")!!
        assertEquals(DownloadState.RUNNING, inFlight.status)
        assertEquals(400L, inFlight.downloadedBytes)
        assertEquals(1_000L, inFlight.expectedTotal)
        assertEquals("\"abc\"", inFlight.ifRange)
        assertEquals("Bearer faketoken", inFlight.headers["Authorization"])

        val done = dao.get("done")!!
        assertEquals(DownloadState.COMPLETED, done.status)
        assertEquals(2_000L, done.downloadedBytes)
        database.close()
    }

    private fun insert(
        id: String,
        destination: String,
        status: String,
        expectedTotal: Long,
        downloadedBytes: Long,
        ifRange: String? = null,
        headers: String = "{}",
    ) = // The column list BELOW must stay in step with the DDL in
        // [createVersion1Database] AND with DownloadEntity — the entity is
        // unmentioned by this literal, and ticket 04's schema change is
        // where all three get edited together.
        "INSERT INTO downloads (id, modelId, url, fileName, destination, expectedTotal, downloadedBytes, status, error, errorCode, ifRange, headers) " +
        "VALUES ('$id', 'model-1', 'https://huggingface.co/x/resolve/main/$id.gguf', '$id.gguf', '$destination', " +
        "$expectedTotal, $downloadedBytes, '$status', NULL, NULL, ${ifRange?.let { "'$it'" } ?: "NULL"}, '$headers')"
}
