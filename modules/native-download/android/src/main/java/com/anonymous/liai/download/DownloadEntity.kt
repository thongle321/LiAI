package com.anonymous.liai.download

import android.content.Context
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
}

@Database(entities = [DownloadEntity::class], version = 1, exportSchema = false)
@TypeConverters(DownloadConverters::class)
abstract class DownloadDatabase : RoomDatabase() {
    abstract fun downloadDao(): DownloadDao

    companion object {
        @Volatile
        private var instance: DownloadDatabase? = null

        fun get(context: Context): DownloadDatabase =
            instance ?: synchronized(this) {
                instance ?: Room
                    .databaseBuilder(
                        context.applicationContext,
                        DownloadDatabase::class.java,
                        "downloads.db",
                    ).build()
                    .also { instance = it }
            }
    }
}
