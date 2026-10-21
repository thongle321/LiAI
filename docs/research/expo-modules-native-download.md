# Android native background download for LiAI (Expo SDK 57 / RN 0.86.3)

Research only — nothing in the repo was modified. Sources: docs.expo.dev, expo/expo `main`, and
locally installed packages (`node_modules/expo-modules-core@57`, `expo-modules-autolinking@57`).

Environment facts verified locally: `expo ~57.0.27`, `react-native 0.86.3`, `expo-file-system 57.0.7`,
`expo-sqlite 57.0.4`, `expo-dev-client` installed, **no** `expo-task-manager`, **no**
`expo-background-task`. Correction to the brief: `app.json` already has a populated `plugins`
array (`expo-router`, vision-camera, `expo-build-properties`, …); `plugins/withOptionalCameraHardware.js`
is indeed unregistered.

---

## 1. The right container: a local Expo module

| Option | Verdict |
|---|---|
| (a) local Expo module in `modules/` | **Correct.** Docs name it "the recommended way" — https://docs.expo.dev/modules/get-started/ |
| (b) config plugin writing Kotlin via `withDangerousMod` | Works, but docs call dangerous/regex mods something to "use sparingly" — https://docs.expo.dev/config-plugins/mods/ |
| (c) classic RN module in generated `android/` | Wrong: `MainApplication.kt` is a generated template whose manual-package hook is only a comment — https://raw.githubusercontent.com/expo/expo/main/templates/expo-template-bare-minimum/android/app/src/main/java/com/helloworld/MainApplication.kt |

Creation: `npx create-expo-module@latest --local` → `modules/<name>/{android,ios,src,expo-module.config.json,index.ts}`
(https://docs.expo.dev/modules/get-started/).

`expo-module.config.json` (https://docs.expo.dev/modules/module-config/; the template itself is
https://unpkg.com/expo-module-template@57.0.1/expo-module.config.json):

```json
{ "platforms": ["android"],
  "android": { "modules": ["expo.modules.download.ExpoDownloadModule"] } }
```
`android.modules` = fully-qualified Kotlin class names written into the generated package provider
file. No `package`/`kotlin srcDir` keys exist — source location is the module's own
`android/src/main/java/...` directory. No manual registration.

Auto-detection: yes, by default. Autolinking step 3 "searches local modules in the directory
specified by `nativeModulesDir`, which defaults to `./modules/`" — https://docs.expo.dev/modules/autolinking/.
Nothing to add to `app.json` (`expo.autolinking` only if you move the folder).

How prebuild wires it: it does **not** copy the Kotlin sources. The generated
`android/settings.gradle` runs `expoAutolinking.useExpoModules()` and autolinked modules "are
automatically added to the build" (https://raw.githubusercontent.com/expo/expo/main/templates/expo-template-bare-minimum/android/settings.gradle,
docs above). I found no copy step in `@expo/prebuild-config` — *could not verify* a copy step exists
in any other package; what I can state is that the module directory is referenced in place.

## 2. Third-party Gradle dependencies

Declare them in the module's own `android/build.gradle`; nothing is needed at app level. Copy the
shape used by every SDK 57 module (`node_modules/expo-file-system/android/build.gradle:1-5`,
`node_modules/expo-background-task/android/build.gradle:1-5`):

```gradle
plugins { id 'com.android.library'; id 'expo-module-gradle-plugin' }
android { namespace "expo.modules.download" }
dependencies {
  implementation 'androidx.work:work-runtime-ktx:2.9.1'   // same coord expo-background-task uses
  implementation 'androidx.room:room-runtime:2.6.1'         // only if you keep Room
  implementation 'androidx.room:room-ktx:2.6.1'
  kapt 'androidx.room:room-compiler:2.6.1'
}
```
The template's own `android/build.gradle` I **could not read** (served as `application/octet-stream`
by unpkg/jsDelivr); the plugin block above is from installed SDK 57 packages using the same
`expo-module-gradle-plugin`. `expo-module-gradle-plugin` supplies `google()`/`mavenCentral()`, so
module-level `implementation` resolves without touching `settings.gradle`. `withAppBuildGradle` /
`withProjectBuildGradle` are only for app/root gradle edits (https://docs.expo.dev/config-plugins/mods/) — not
needed for dependencies. No `dependencyResolutionManagement` block exists in the generated
settings.gradle (verified in the template above), so the classic "settings repo mode breaks
`implementation project(':module')`" gotcha does not apply to the stock prebuild; I **could not
verify** an Expo doc statement about it.

## 3. Module API shape

Use the Expo Modules API, not TurboModules — no codegen spec file, no `NativeXModuleSpec`, no
`DownloadPackage`. https://docs.expo.dev/modules/overview/ ("best choice for the vast majority").

```kotlin
class ExpoDownloadModule : Module() {
  private val scope get() = ...                      // use module's own coroutine scope
  override fun definition() = ModuleDefinition {
    Name("ExpoDownload")
    Events("onDownloadProgress", "onDownloadComplete", "onDownloadFailed", "onDownloadCancelled")
    OnStartObserving("onDownloadProgress") { /* attach WorkInfo observers here */ }
    OnStopObserving("onDownloadProgress") { /* detach */ }

    AsyncFunction("startDownload") { url: String, opts: Map<String, Any?> -> /* Promise map */ }
    AsyncFunction("startDownloadSuspend") Coroutine { url: String -> /* suspend body, no Promise arg */ }
    AsyncFunction("getActiveDownloads") { -> listOf<Map<String, Any?>>() }
    AsyncFunction("cancelDownload") { id: String -> true }
  }
}
```
- `AsyncFunction` returns a Promise and runs off the JS thread; a **suspend** body uses infix
  `Coroutine { }` and cannot take a `Promise` — its scope is bound to the module lifecycle, so
  unfinished work is cancelled when the module is deallocated. Don't park a download there; enqueue
  WorkManager and return. https://docs.expo.dev/modules/module-api/
- Events: declare with `Events(...)`, emit with `this@Module.sendEvent(name, bundleOf(...))`
  (`expo.modules.kotlin.modules.Module.kt` `sendEvent`, payload is a `Bundle` on Android), subscribe
  in JS with `Module.addListener('onProgress', cb)` returning an `EventSubscription` you `.remove()`.
  Docs walkthrough: https://docs.expo.dev/modules/native-module-tutorial/

Production caveats (verified in `node_modules/expo-modules-core/android/src/main/java/expo/modules/kotlin/events/KModuleEventEmitterWrapper.kt`):
- `checkIfEventWasExported` **throws** `IllegalArgumentException("Unsupported event: …")` for any name not listed in `Events(...)`.
- `emitNative` does `moduleHolder.safeJSObject ?: return` — events emitted when the JS runtime is gone are **silently dropped**. Progress must be recoverable by polling, not by live events alone.
- `sendEvent` is `moduleEventEmitter?.emit(...)` — a no-op once the module is destroyed.
- Registering a `NativeModule` subclass in TS (`requireNativeModule<…>`) is what gives you `addListener`.

## 4. WorkManager inside an Expo module: viable, proven in-tree

`expo-background-task` ships exactly this: `implementation 'androidx.work:work-runtime-ktx:2.9.1'`
(https://raw.githubusercontent.com/expo/expo/main/packages/expo-background-task/android/build.gradle),
a `BackgroundTaskScheduler` enqueuing `OneTimeWorkRequestBuilder` with `Constraints`,
`ExistingWorkPolicy`, and `getWorkInfosForUniqueWork(...).await()`, plus
`AsyncFunction(...) Coroutine { … }` in `BackgroundTaskModule.kt`. Its
`android/src/main/AndroidManifest.xml` is **empty** → no `androidx.startup` `InitializationProvider`
exclusion is required; WorkManager's default initializer stays and no duplicate init occurs as long
as you don't hand-add a provider. Expo's own module reuses the classic bridge/headless task
service for JS, but a plain `CoroutineWorker` needs no JS at all.

Consequences for this port: the worker must write progress to durable storage; events are
best-effort; on app start JS must call `getActiveDownloads()` to re-attach.
`BuildConfig.VERSION_NAME` in `DownloadWorker.kt` (pocketpal) is unavailable in a module — pass the
user agent from JS instead. The `0.1.4 / 2025-04-02` "Android fixes" release: **could not verify** —
that tag is not on GitHub releases and npm only exposes recent `57.x/58.x` versions
(https://registry.npmjs.org/expo-background-task).

## 5. Persistence

Least code for this case: **no Room.** WorkManager's own SQLite already stores state, work id and
progress; add a single JSON blob (`SharedPreferences`, write-atomic, ~one file) mapping
`downloadId → {url, destination, status, totalBytes}`. Both Kotlin and JS can read it — JS via
`AsyncFunction("getDownloads")`, no `expo-sqlite` bridge into Kotlin, no kapt, no migrations (the
pocketpal Room database already needs a 1→2 migration: `DownloadDatabase.kt:11-16`). Room only pays
if you later want queries; upgrade then, storing in the existing `expo-sqlite` DB if JS-heavy.

## 6. Minimal TS surface

```ts
// modules/expo-download/src/ExpoDownload.types.ts
export type DownloadStatus = 'queued'|'running'|'paused'|'completed'|'failed'|'cancelled';
export type DownloadRecord = { id: string; url: string; destination: string;
  status: DownloadStatus; bytesWritten: number; totalBytes: number; error?: string };
export type StartOptions = { destination: string; authToken?: string;
  networkType?: 'ANY'|'WIFI'; progressInterval?: number; headers?: Record<string,string> };

declare const ExpoDownload: NativeModule<{
  onDownloadProgress: (e: DownloadRecord) => void;
  onDownloadComplete: (e: DownloadRecord) => void;
  onDownloadFailed: (e: DownloadRecord) => void;
  onDownloadCancelled: (e: DownloadRecord) => void;
}> & {
  startDownload(url: string, opts: StartOptions): Promise<{ id: string }>;
  pauseDownload(id: string): Promise<boolean>;
  resumeDownload(id: string): Promise<boolean>;
  cancelDownload(id: string): Promise<boolean>;
  getActiveDownloads(): Promise<DownloadRecord[]>;
  getAllDownloads(): Promise<DownloadRecord[]>;
};
```
This mirrors `lib/download-service.ts` (`DownloadJob`, `progressCallback`, `completeCallback`) and
`store/models/downloads.ts`, so only the service's Android branch changes — iOS keeps
`FileSystemSessionType.BACKGROUND`. `getAllDownloads()` at startup feeds the existing
`resumeDataForPartial`/`classifyFileOnDisk` reconciliation.

## 7. Testing

- JS: ship `modules/expo-download/mocks/ExpoDownload.ts`; `jest-expo` auto-returns it for
  `requireNativeModule` — https://docs.expo.dev/modules/mocking-native-calls/. Note this repo uses
  `node --test`, so hand-roll one fake module object instead of adopting Jest.
- Kotlin: JVM unit tests with `androidx.work:work-testing` + Robolectric. The SDK 57 module template
  pattern is present in `node_modules/expo-file-system/android/build.gradle:14-16,27-29`
  (`unitTests.includeAndroidResources = true`, `testImplementation 'org.robolectric:robolectric:4.16'`).
  No device needed.
- Device only for: real process-death survival.
- CI: `npx expo-modules-autolinking verify` (duplicate/autolinking check,
  https://docs.expo.dev/modules/autolinking/), `npx expo prebuild --clean && git diff --exit-code`
  to prove no native drift, `npm run typecheck`, `npm test`, then an EAS/`expo run:android` build.

## 8. Gotchas

1. Hand edits to `android/` die on the next `prebuild --clean` (CNG) — verified: the generated
   `MainApplication.kt` ships only a comment placeholder for manual packages.
2. `platforms: ["android"]` missing/incomplete → module silently skipped
   (docs.expo.dev/modules/autolinking, "What do I need to have in my module to make it autolinkable?").
3. Forgetting `id 'expo-module-gradle-plugin'` or the `namespace` → Gradle failure, not a runtime one.
4. `Events(...)` mismatch → `sendEvent` throws at runtime; module disappears on first emit.
5. Duplicate WorkManager init only if you add an `InitializationProvider` — expo-background-task
   ships an empty manifest, so do nothing.
6. Module not registering: `android.modules` must be the **full** package + class name; check with
   `npx expo-modules-autolinking resolve --platform android`.
7. Listener leaks across dev reloads: every `addListener` must be removed on unmount, and
   WorkInfo `observeForever` observers must be removed in `OnStopObserving`/`OnDestroy` — otherwise
   reloads multiply observers (the pocketpal `workObservers` map at
   `pocketpal-ai/.../DownloadModule.kt` shows the shape to replicate, minus the logging).
8. `expo-dev-client`: native changes require `npx expo run:android`; JS-only changes do not, and
   `prebuild --clean` is needed after adding the module
   (https://docs.expo.dev/develop/development-builds/introduction/). A dev-client JS reload does not
   restart the Kotlin worker — expect `getActiveDownloads()` reconciliation, not live events.
9. Progress flooding: keep the existing `lastEmit` throttle in `lib/download-service.ts:~70`; a
   WorkManager `setProgress` per buffer chunk will saturate the JS thread.

## Recommended order of work

| # | Step | Verify (no device needed?) |
|---|---|---|
| 1 | `npx create-expo-module@latest --local` → `modules/expo-download`; delete its view files | **Yes.** `npx expo-modules-autolinking search` lists `expo-download`; `resolve --platform android` shows its build.gradle |
| 2 | Set `platforms: ["android"]`, `android.modules` | **Yes.** `npx expo-modules-autolinking verify` |
| 3 | Minimal module: `Name` + one `AsyncFunction("ping")` + `AsyncFunction … Coroutine {}`; add `work-runtime-ktx` + okhttp (already `api` in expo-file-system) to its build.gradle | **Yes.** `npx expo prebuild --clean`, then Gradle compiles: `cd android && ./gradlew :expo-download:assembleDebug` |
| 4 | Add persistence + `DownloadWorker` (Range resume from `File.length()`, backoff, status JSON) | **Yes.** JVM unit test: enqueue a `CoroutineWorker` via `work-testing` and assert `Result.success()` + file size |
| 5 | Add `startDownload/pause/resume/cancel/getActiveDownloads` + `Events(...)` + `sendEvent`; register observers in `OnStartObserving` | **Yes.** Kotlin tests for state machine; JS test against `mocks/ExpoDownload.ts` |
| 6 | Wire `lib/download-service.ts` Android branch to the module; add `modules/` import; keep iOS legacy path | **Yes.** `npm run typecheck && npm test` |
| 7 | **Device/emulator**: `npx expo run:android`, start a download, `adb shell am force-stop com.anonymous.liai`, relaunch → `getActiveDownloads()` shows `running` and the byte count keeps climbing; `adb shell dumpsys jobscheduler \| grep liai` while the app is closed | **No — device required** |
| 8 | Re-run `prebuild --clean` and confirm nothing regressed; add the CI checks from §7 | **Yes** |

Skipped: Room (use the JSON status store until queries are needed), a config plugin (nothing to
inject), `expo-background-task`/`expo-task-manager` (they solve headless-JS tasks, not resumable
HTTP transfers). Add a config plugin only when you later need manifest/permission/ProGuard edits.