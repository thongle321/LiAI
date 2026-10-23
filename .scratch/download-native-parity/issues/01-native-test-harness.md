# 01: Native test harness for `modules/native-download`

**What to build:**

Stand up the Kotlin/Robolectric test harness for the native download module, modelled on the reference app's setup (`pocketpal-ai/android/app/build.gradle:241-248`, `robolectric.conscryptMode OFF` at :169):

- `modules/native-download/android/build.gradle`: add `testImplementation` deps — junit 4.13.2, Robolectric 4.16, androidx.test:core-ktx 1.7.0, room-testing (project's Room version), sqlite-bundled-jvm 2.6.1, okhttp3 mockwebserver 4.12.0, androidx.work:work-testing 2.10.5, kotlinx-coroutines-test 1.9.0. Test-scope only; nothing ships in the app runtime.
- `modules/native-download/android/src/test/java/...`: harness for the suites the next tickets port — room in-memory DB with sqlite-bundled driver, MockWebServer base-client factory matching the worker's shared client shape, and a MigrationTestHelper baseline against the current Room schema (v1, `DownloadEntity.kt:112` `version = 1, exportSchema = false`).
- Port the harness scaffolding of the reference suites (`pocketpal-ai/android/app/src/test/java/com/pocketpalai/download/`: `TestDownloads.kt` fixtures and the migration-test skeleton) adapted to LiAI's entity/DAO/worker names (`com.anonymous.liai.download`). The per-suite ports themselves land with tickets 02–05; this ticket proves the harness runs and documents how each later ticket adds its suite.
- Record the invocation used to run the suite (e.g. `gradlew :modules:native-download:test`) in the ticket/audit "Not checked" follow-up notes.

This closes the audit's "Not checked" coverage gap (Kotlin unreachable from `npm test`): after this ticket native changes verify in CI instead of staying "unverified until someone runs the app".

**Blocked by:** None (can start immediately)

**Status:** resolved

Acceptance:

- [x] Test deps are `testImplementation` only; release/app runtime unchanged
- [x] `gradlew :modules:native-download:test` runs green on the existing code with at least a smoke test + in-memory Room setup + MigrationTestHelper against v1 *(delivered as: invocation is `:native-download:testDebugUnitTest`; the v1 baseline is the hand-built-schema idiom, not MigrationTestHelper — see Resolution)*
- [x] Fixture helpers (`TestDownloads.kt` equivalent) exist for suites landing in tickets 02–05
- [x] `npm run typecheck` and `npm test` unaffected (no JS surface touched)

## Resolution

- Invocation: `.\gradlew.bat :native-download:testDebugUnitTest` (module gradle path is `:native-download`, project dir `modules/native-download/android`). Result: **9 tests, 0 failures** — `DownloadDaoTest` (8) + `DownloadMigrationTest` (1).
- Files: `modules/native-download/android/build.gradle` (test-scope deps + `testOptions.includeAndroidResources` + `robolectric.conscryptMode OFF`), `src/test/java/com/anonymous/liai/download/TestDownloads.kt` (fixtures: `inMemoryDatabase`, `downloadRow`, `stagingServer`), `DownloadDaoTest.kt` (smoke over the CURRENT DAO verbs: upsert/get/all/updateProgress/updateStatus/delete/observeAll + `isTerminal`), `DownloadMigrationTest.kt` (v1 baseline).
- Version adaptations from the reference (recorded in build.gradle comments): room-testing **2.7.1** and work-testing **2.9.1** match this module's own pins (reference pins 2.8.2/2.10.5), and mockwebserver is pinned **4.9.2** to the PRODUCTION okhttp (reference uses 4.12.0, but this module's runtime okhttp is 4.9.2 — the transfer behavior under test must be the one that ships). junit 4.13.2 / Robolectric 4.16 / core-ktx 1.7.0 / sqlite-bundled-jvm 2.6.1 / coroutines-test 1.9.0 as specified.
- Migration baseline is the reference's hand-built-schema idiom (literal DDL + `PRAGMA user_version = 1`), NOT `MigrationTestHelper`: the entity has `exportSchema = false`, so there is no exported schema JSON for MigrationTestHelper to load. Tickets 04/05 extend this suite with `MIGRATION_1_2` (validator columns + stalledRuns).
- The MockWebServer "client factory" deferred deliberately: the worker today builds a plain `OkHttpClient()` inline (`DownloadWorker.kt:54`), so there is no client injection point to factory yet — `stagingServer()` exists in TestDownloads.kt and the worker test (ticket 02) introduces the injectable client.
- JS surface: none touched; `npm run typecheck` clean.
