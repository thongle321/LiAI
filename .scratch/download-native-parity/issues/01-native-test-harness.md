# 01: Native test harness for `modules/native-download`

**What to build:**

Stand up the Kotlin/Robolectric test harness for the native download module, modelled on the reference app's setup (`pocketpal-ai/android/app/build.gradle:241-248`, `robolectric.conscryptMode OFF` at :169):

- `modules/native-download/android/build.gradle`: add `testImplementation` deps — junit 4.13.2, Robolectric 4.16, androidx.test:core-ktx 1.7.0, room-testing (project's Room version), sqlite-bundled-jvm 2.6.1, okhttp3 mockwebserver 4.12.0, androidx.work:work-testing 2.10.5, kotlinx-coroutines-test 1.9.0. Test-scope only; nothing ships in the app runtime.
- `modules/native-download/android/src/test/java/...`: harness for the suites the next tickets port — room in-memory DB with sqlite-bundled driver, MockWebServer base-client factory matching the worker's shared client shape, and a MigrationTestHelper baseline against the current Room schema (v1, `DownloadEntity.kt:112` `version = 1, exportSchema = false`).
- Port the harness scaffolding of the reference suites (`pocketpal-ai/android/app/src/test/java/com/pocketpalai/download/`: `TestDownloads.kt` fixtures and the migration-test skeleton) adapted to LiAI's entity/DAO/worker names (`com.anonymous.liai.download`). The per-suite ports themselves land with tickets 02–05; this ticket proves the harness runs and documents how each later ticket adds its suite.
- Record the invocation used to run the suite (e.g. `gradlew :modules:native-download:test`) in the ticket/audit "Not checked" follow-up notes.

This closes the audit's "Not checked" coverage gap (Kotlin unreachable from `npm test`): after this ticket native changes verify in CI instead of staying "unverified until someone runs the app".

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

Acceptance:

- [ ] Test deps are `testImplementation` only; release/app runtime unchanged
- [ ] `gradlew :modules:native-download:test` runs green on the existing code with at least a smoke test + in-memory Room setup + MigrationTestHelper against v1
- [ ] Fixture helpers (`TestDownloads.kt` equivalent) exist for suites landing in tickets 02–05
- [ ] `npm run typecheck` and `npm test` unaffected (no JS surface touched)
