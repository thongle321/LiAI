package com.anonymous.liai.download

import com.google.gson.Gson

/** Where a download is in its life. Mirrors the JS `ModelDownloadStatus`
 *  vocabulary so the bridge does not have to translate, with `queued` as the
 *  one state JS has no word for (WorkManager has accepted the job but not
 *  started the worker yet). */
enum class DownloadState {
    QUEUED,
    RUNNING,
    PAUSED,
    COMPLETED,
    FAILED,
    CANCELLED,
}

/**
 * One download's durable state.
 *
 * Lives in a JSON file rather than Room on purpose: this is a record to read
 * back after the process died, not a table to query. The only query is "give
 * me everything that is not terminal", which is a list comprehension over
 * this file. Room would be a schema, migrations, and a DAO for that.
 *
 * [expectedTotal] is what the Hub said the file is, and it is deliberately
 * separate from what Content-Length reports: a resume answered with 206 has a
 * Content-Length for the REMAINDER, not the whole file, and treating the two
 * as the same thing is how a complete download gets declared short.
 */
data class DownloadRecord(
    val id: String,
    val modelId: String,
    val url: String,
    val fileName: String,
    val destinationPath: String,
    val expectedTotal: Long,
    val state: DownloadState = DownloadState.QUEUED,
    val downloadedBytes: Long = 0L,
    val error: String? = null,
    /** Machine-readable failure kind, mirroring the JS `DownloadErrorCode`. */
    val errorCode: String? = null,
    /** HF LFS content id, sent as If-Range so a resume cannot splice two
     *  versions of one file together. */
    val ifRange: String? = null,
    val headers: Map<String, String> = emptyMap(),
) {
    fun isTerminal(): Boolean =
        state == DownloadState.COMPLETED ||
            state == DownloadState.FAILED ||
            state == DownloadState.CANCELLED
}

/**
 * The JSON status store.
 *
 * Every mutation goes through [mutate], which reads, applies, writes, and
 * guards the whole file with a process-wide lock. Two workers can be alive at
 * once (a GGUF and its mmproj), and a half-written JSON file on next launch
 * would strand both — so a failed parse is treated as "no records", never as
 * a crash and never as silent data loss beyond what the download already lost.
 */
class DownloadStore(
    private val file: java.io.File,
) {
    private val gson = Gson()
    private val lock = Any()

    fun all(): List<DownloadRecord> =
        synchronized(lock) {
            if (!file.exists()) return@synchronized emptyList()
            runCatching {
                val parsed = gson.fromJson(file.readText(), Array<DownloadRecord>::class.java)
                parsed?.toList() ?: emptyList()
            }.getOrElse { emptyList() }
        }

    fun get(id: String): DownloadRecord? = all().firstOrNull { it.id == id }

    fun mutate(
        id: String,
        block: (DownloadRecord) -> DownloadRecord?,
    ) {
        synchronized(lock) {
            val current =
                runCatching {
                    if (file.exists()) {
                        gson
                            .fromJson(file.readText(), Array<DownloadRecord>::class.java)
                            ?.toList()
                            ?: emptyList()
                    } else {
                        emptyList()
                    }
                }.getOrElse { emptyList() }
            val updated =
                current.filterNot { it.id == id } +
                    (
                        block(
                            current.firstOrNull { it.id == id }
                                ?: error("no such download: $id"),
                        )
                            ?: return@synchronized
                    )
            runCatching {
                file.parentFile?.mkdirs()
                file.writeText(gson.toJson(updated))
            }
        }
    }

    /** Create-or-update. [mutate] is for updating an existing record and
     *  throws when it is absent; starting a download has to be able to
     *  create one, so that path uses this instead. */
    fun upsert(
        id: String,
        block: (DownloadRecord?) -> DownloadRecord?,
    ) {
        synchronized(lock) {
            val current =
                runCatching {
                    if (file.exists()) {
                        gson
                            .fromJson(file.readText(), Array<DownloadRecord>::class.java)
                            ?.toList()
                            ?: emptyList()
                    } else {
                        emptyList()
                    }
                }.getOrElse { emptyList() }
            val next =
                block(current.firstOrNull { it.id == id })
                    ?: return@synchronized
            runCatching {
                file.parentFile?.mkdirs()
                file.writeText(gson.toJson(current.filterNot { it.id == id } + next))
            }
        }
    }

    fun remove(id: String) {
        synchronized(lock) {
            val kept = all().filterNot { it.id == id }
            runCatching { file.writeText(gson.toJson(kept)) }
        }
    }
}
