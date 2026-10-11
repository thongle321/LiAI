package com.anonymous.liai.download

import androidx.room.withTransaction

/**
 * Thin facade over [DownloadDao], so the worker and the module talk to one
 * API instead of Room directly.
 *
 * Every method is `suspend`: Room's DAO is suspend/Flow-based, and faking
 * synchrony with runBlocking would put a disk write on whichever thread
 * happened to call — including the JS thread. Callers here are already
 * coroutines (CoroutineWorker, or an AsyncFunction declared `Coroutine`).
 *
 * Takes the [DownloadDatabase] rather than the DAO, because the atomic
 * read-modify-write in [mutate] needs `withTransaction`, and Room's generated
 * DAO does not expose the database it came from.
 */
class DownloadStore(
    private val db: DownloadDatabase,
) {
    private val dao: DownloadDao get() = db.downloadDao()

    suspend fun all(): List<DownloadEntity> = dao.all()

    suspend fun get(id: String): DownloadEntity? = dao.get(id)

    suspend fun observeAll() = dao.observeAll()

    /** Create-or-replace by primary key. */
    suspend fun upsert(entity: DownloadEntity) = dao.upsert(entity)

    suspend fun delete(id: String) = dao.delete(id)

    suspend fun updateProgress(
        id: String,
        bytes: Long,
        status: DownloadState,
    ) = dao.updateProgress(id, bytes, status)

    suspend fun updateStatus(
        id: String,
        status: DownloadState,
        error: String?,
    ) = dao.updateStatus(id, status, error)

    /**
     * Read-modify-write against the row, in one transaction.
     *
     * Room offers no atomic "update field X", and two workers can be live at
     * once (a GGUF and its mmproj), so an unguarded read-then-write drops
     * whichever write loses the race. Returning null from [block] deletes the
     * row. A missing id is a no-op rather than a throw, so a late write from
     * a cancelled worker cannot crash the app.
     */
    suspend fun mutate(
        id: String,
        block: (DownloadEntity) -> DownloadEntity?,
    ) {
        db.withTransaction {
            val current = dao.get(id) ?: return@withTransaction
            val next = block(current) ?: return@withTransaction dao.delete(id)
            dao.upsert(next)
        }
    }
}
