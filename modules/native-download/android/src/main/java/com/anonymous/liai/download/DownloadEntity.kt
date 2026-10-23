package com.anonymous.liai.download

import android.content.Context
import androidx.room.ColumnInfo
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.TypeConverter
import androidx.room.TypeConverters
import androidx.room.migration.Migration
import androidx.sqlite.SQLiteConnection
import androidx.sqlite.execSQL
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import kotlinx.coroutines.flow.Flow

/** Room persistence, matching pocketpal-ai's download store
 *  (DownloadEntity.kt / DownloadDao.kt / DownloadDatabase.kt).
 *
 *  Deliberately close to theirs rather than reinvented: same table name, same
 *  primary key, same suspend-per-record writes plus an observable Flow. The
 *  extra columns are the things their entity lacks and this app needs —
 *  `modelId` so a row maps back to a model card, `errorCode` so the dialog can
 *  offer token recovery, and `ifRange`/`headers` so a worker restarted after
 *  process death can resume safely.
 */
@Entity(tableName = "downloads")
data class DownloadEntity(
    @PrimaryKey val id: String,
    val modelId: String,
    val url: String,
    val fileName: String,
    val destination: String,
    /** What the Hub says the file is. Never Content-Length: on a 206 that is
     *  the size of the remainder, and conflating the two is how a complete
     *  download gets declared short. */
    val expectedTotal: Long,
    val downloadedBytes: Long,
    val status: DownloadState,
    val error: String? = null,
    val errorCode: String? = null,
    /** HF LFS content id, sent as a quoted If-Range entity-tag so a resume
     *  cannot splice two versions of one path together. */
    val ifRange: String? = null,
    /** Persisted because a worker revived after process death has to
     *  re-authenticate; there is no other source for it once JS is gone. */
    val headers: Map<String, String> = emptyMap(),
    /** Consecutive no-byte runs, for the engine's stall watchdog (ticket 04).
     *  A run that wrote bytes heals it to 0; 5 in a row fails the download. */
    @ColumnInfo(defaultValue = "0")
    val stalledRuns: Int = 0,
    /** The server's entity-tag for the in-flight response, and the total it
     *  announced — the validator pair a resume must match (ticket 05). */
    val etag: String? = null,
    val totalBytes: Long? = null,
    /** Wall-clock row creation, so multi-destination supersede logic (ticket
     *  05) can tell which row for one destination is the newest. */
    @ColumnInfo(defaultValue = "0")
    val createdAt: Long = 0,
)

/** Terminal = the transfer is over in a way no automatic step continues.
 *  QUEUED, RUNNING, and PAUSED are all still live work. */
fun isTerminal(record: DownloadEntity): Boolean =
    record.status == DownloadState.COMPLETED ||
        record.status == DownloadState.FAILED ||
        record.status == DownloadState.CANCELLED

class DownloadConverters {
    private val gson = Gson()

    @TypeConverter
    fun fromState(state: DownloadState): String = state.name

    @TypeConverter
    fun toState(value: String): DownloadState = runCatching { DownloadState.valueOf(value) }.getOrDefault(DownloadState.FAILED)

    @TypeConverter
    fun fromHeaders(headers: Map<String, String>): String = gson.toJson(headers)

    @TypeConverter
    fun toHeaders(value: String): Map<String, String> =
        runCatching {
            gson.fromJson<Map<String, String>>(value, object : TypeToken<Map<String, String>>() {})
        }.getOrNull() ?: emptyMap()
}

@Dao
interface DownloadDao {
    /** Observable, matching pocketpal-ai's `getAllDownloads(): Flow<...>`.
     *  This is what drives the push events on top of polling. */
    @Query("SELECT * FROM downloads")
    fun observeAll(): Flow<List<DownloadEntity>>

    @Query("SELECT * FROM downloads")
    suspend fun all(): List<DownloadEntity>

    @Query("SELECT * FROM downloads WHERE id = :id")
    suspend fun get(id: String): DownloadEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: DownloadEntity)

    @Query("DELETE FROM downloads WHERE id = :id")
    suspend fun delete(id: String)

    @Query("UPDATE downloads SET downloadedBytes = :bytes, status = :status WHERE id = :id")
    suspend fun updateProgress(
        id: String,
        bytes: Long,
        status: DownloadState,
    )

    @Query("UPDATE downloads SET status = :status, error = :error WHERE id = :id")
    suspend fun updateStatus(
        id: String,
        status: DownloadState,
        error: String?,
    )

    // --- Ticket 04 surface (reference DownloadDao.kt patterns) -----------

    /** Claim a row into a new status only if it still sits in one of the
     *  entry states — the compare-and-set that keeps two workers from
     * transfering one download. Returns the number of rows written. */
    @Query(
        "UPDATE downloads SET status = :status, error = :error " +
            "WHERE id = :id AND status IN (:entryStates)",
    )
    suspend fun casStatus(
        id: String,
        entryStates: List<DownloadState>,
        status: DownloadState,
        error: String? = null,
    ): Int

    /** Publish bytes while the transfer is live. RUNNING-guarded: 0 means the
     *  row left RUNNING under us (paused/cancelled raced the write) and the
     *  caller must stop. Bytes advancing is proof of life, so stalledRuns
     *  heals to 0 here. */
    @Query(
        "UPDATE downloads SET downloadedBytes = :bytes, totalBytes = :totalBytes, " +
            "stalledRuns = 0 WHERE id = :id AND status = 'RUNNING'",
    )
    suspend fun writeProgress(
        id: String,
        bytes: Long,
        totalBytes: Long?,
    ): Int

    /** Pin the response validator pair (etag + announced total) and the
     *  resumed offset in one write, so a later resume can verify the remote
     *  file did not change. */
    @Query(
        "UPDATE downloads SET etag = :etag, totalBytes = :totalBytes, " +
            "downloadedBytes = :offset WHERE id = :id",
    )
    suspend fun writeValidators(
        id: String,
        etag: String?,
        totalBytes: Long?,
        offset: Long,
    ): Int

    /** Every row pointed at one file path, newest first — how a re-enqueue
     *  finds the row it supersedes (ticket 05). */
    @Query("SELECT * FROM downloads WHERE destination = :destination ORDER BY createdAt DESC")
    suspend fun byDestination(destination: String): List<DownloadEntity>

    /** End a live run without failing it: reschedule the row as QUEUED and
     *  carry the stall count across process death. RUNNING-guarded: a
     *  pause/cancel that settles the row first must win — 0 means the run
     *  ends Stopped instead of resurrecting a settled row QUEUED. Never
     *  writes a FAILED — the QUEUED-requeue discipline is deliberate (see
     *  audit). */
    @Query(
        "UPDATE downloads SET status = :status, error = :error, stalledRuns = :stalledRuns " +
            "WHERE id = :id AND status = 'RUNNING'",
    )
    suspend fun endTransientRun(
        id: String,
        stalledRuns: Int,
        status: DownloadState,
        error: String?,
    ): Int
}

@Database(entities = [DownloadEntity::class], version = 2, exportSchema = false)
@TypeConverters(DownloadConverters::class)
abstract class DownloadDatabase : RoomDatabase() {
    abstract fun downloadDao(): DownloadDao

    companion object {
        /** v1 → v2 (ticket 04): the columns the engine port needs. Validators
         *  (etag/totalBytes) and createdAt are nullable/defaulted, so v1 rows
         *  survive with "no validator known, never stalled, oldest ordering".
         *  The stalledRuns default matters more than 0: it is how a v1 row
         *  that was mid-fire gets its watchdog counter re-based.
         *
         *  Written against [SQLiteConnection], not SupportSQLiteDatabase: the
         *  module (and every test) opens through the KMP BundledSQLiteDriver
         *  path, where only the SQLiteConnection overload runs. */
        val MIGRATION_1_2 =
            object : Migration(1, 2) {
                override fun migrate(db: SQLiteConnection) {
                    db.execSQL("ALTER TABLE downloads ADD COLUMN stalledRuns INTEGER NOT NULL DEFAULT 0")
                    db.execSQL("ALTER TABLE downloads ADD COLUMN etag TEXT")
                    db.execSQL("ALTER TABLE downloads ADD COLUMN totalBytes INTEGER")
                    db.execSQL("ALTER TABLE downloads ADD COLUMN createdAt INTEGER NOT NULL DEFAULT 0")
                }
            }

        @Volatile
        private var instance: DownloadDatabase? = null

        fun get(context: Context): DownloadDatabase =
            instance ?: synchronized(this) {
                instance ?: Room
                    .databaseBuilder(
                        context.applicationContext,
                        DownloadDatabase::class.java,
                        "downloads.db",
                    )
                    .addMigrations(MIGRATION_1_2)
                    .build()
                    .also { instance = it }
            }
    }
}
