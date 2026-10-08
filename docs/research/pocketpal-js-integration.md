# PocketPal → JS integration of the Android download module

Sources: `pocketpal-ai/src/**` only. Everything below is quoted from code.

## 1. Shape of the JS integration

`DownloadManager` is an **exported class**, instantiated exactly once as a module-level singleton in the barrel file:

- `pocketpal-ai/src/services/downloads/index.ts:7` — `export const downloadManager = new DownloadManager();`
- `pocketpal-ai/src/services/downloads/DownloadManager.ts:50` — `export class DownloadManager`

It lives **outside** the MobX store tree (store dir vs. `services/downloads/`) and is the lower layer; `ModelStore` imports it as a plain module import: `pocketpal-ai/src/store/ModelStore.ts:50`. No DI, no context, no React.

Internals: `private downloadJobs: DownloadMap` is `observable.map(new Map())` keyed by **model id**, while the native layer is keyed by **downloadId string** (`DownloadManager.ts:53`, `:476`). The class is `makeAutoObservable(this)` (`DownloadManager.ts:58`) and its reads are MobX-reactive getters:

- `DownloadManager.ts:243` — `get activeJobs(): DownloadJob[]` (filtered to `state.isDownloading`)
- `DownloadManager.ts:230` — `isDownloading(modelId)` reads the map

**No React hook exists.** There is no `useDownload`/`useDownloads` anywhere in `src/` (grep returns nothing). Components read the observable getter directly and re-render via `mobx-react` `observer`:

- `pocketpal-ai/src/store/ModelStore.ts:1673` — `get activeDownloads()` maps `downloadManager.activeJobs` into plain view-models
- `pocketpal-ai/src/components/DownloadOverlay/DownloadBanner.tsx:35` `observer(`, `:41` reads `modelStore.activeDownloads`
- `pocketpal-ai/src/components/DownloadOverlay/DownloadOverlay.tsx:19,29` — `observer` + `reaction` on `modelStore.activeDownloads.map(d => d.modelId)`

Actual call sites into DownloadManager from the store: `setCallbacks` (`:294`), `isDownloading` (`:734, 1454, 1553, 1589, 1663, 3558, 3927`), `syncWithActiveDownloads` (`:763`), `startDownload` (`:1622`), `cancelDownload` (`:1651`), `getDownloadProgress` (`:1667`), `activeJobs` (`:1684`).

## 2. Native module surface

TurboModule, codegen'd. Spec: **`pocketpal-ai/src/specs/NativeDownloadModule.ts`**, wired by `codegenConfig` at `pocketpal-ai/package.json:138-145` (`jsSrcsDir: "src/specs"`, `type: "all"`, android `javaPackageName: com.pocketpal.specs`).

```ts
interface DownloadConfig { destination: string; authToken?: string;
  networkType?: 'WIFI'|'ANY'; progressInterval?: number; priority?: number }   // :5
interface DownloadResponse { downloadId: string }                              // :11
interface ActiveDownload { id: string; url: string; destination: string;
  progress: number; status: string }                                           // :15
interface Spec extends TurboModule {
  addListener(eventName: string): void; removeListeners(count: number): void;  // :26
  startDownload(url: string, config: DownloadConfig): Promise<DownloadResponse>; // :30
  pauseDownload(downloadId: string): Promise<boolean>;                          // :31
  resumeDownload(downloadId: string): Promise<boolean>;                         // :32
  retryDownload(downloadId: string): Promise<boolean>;                          // :33
  cancelDownload(downloadId: string): Promise<boolean>;                         // :34
  getActiveDownloads(): Promise<ActiveDownload[]>;                              // :36
  reattachDownloadObserver(downloadId: string): Promise<boolean>;               // :37
  logDownloadDatabase(): Promise<boolean>;                                      // :40
}
export default Platform.OS === 'android'
  ? TurboModuleRegistry.getEnforcing<Spec>('DownloadModule') : (null as any)   // :43-45
```

Registered name is `'DownloadModule'` (`NativeDownloadModule.ts:44`); Kotlin class at `pocketpal-ai/android/app/src/main/java/com/pocketpalai/download/DownloadModule.kt`.

**Only 4 of these are ever called from JS** (`DownloadManager.ts:499 startDownload`, `:554 cancelDownload`, `:633 getActiveDownloads`, `:701-702 reattachDownloadObserver`). `pauseDownload`, `resumeDownload`, `retryDownload`, `logDownloadDatabase` are **dead from JS** — declared, implemented in Kotlin (`DownloadModule.kt:210, 226, 262, 197`), never invoked.

## 3. Event subscription

`NativeEventEmitter` from plain react-native, set up **in the DownloadManager constructor** — not a hook, not a component:

- `DownloadManager.ts:61-66` — `if (Platform.OS === 'android') this.setupAndroidEventListener();`
- `DownloadManager.ts:69` — `new NativeEventEmitter(NativeDownloadModule as any)` (the `as any` is required for the TurboModule)
- `:71` `addListener('onDownloadProgress', …)`, `:130` `onDownloadComplete`, `:165` `onDownloadFailed`

Listeners are anonymous arrows, never stored, only `removeAllListeners` in `cleanup()` (`:611-613`) — and `cleanup()` has **no callers**. There is **no re-attach logic on JS reload** other than the constructor re-running. Because the singleton is created at module-eval time, a Fast Refresh that re-evaluates `index.ts` re-runs the constructor and adds a **second** emitter/listener set with no teardown of the first. Could not verify whether Fast Refresh re-evaluates this module in practice.

`onDownloadCancelled` is emitted by Kotlin (`DownloadModule.kt:364`) and **never handled in JS** — cancellation is driven entirely by the JS-side promise (`DownloadManager.ts:554`).

## 4. Cold start / reconciliation — the important path

Boot chain, end to end:

1. `ModelStore` is constructed; `makePersistable(...).then(async () => { …; this.initializeStore(); })` — `ModelStore.ts:698-703`. Hydration completes **before** `initializeStore`, so `this.models` is populated.
2. `downloadManager.setCallbacks({...})` runs in the same constructor, before hydration resolves (`ModelStore.ts:294-338`): `onProgress` writes `model.progress`/`model.downloadSpeed` (`:295-303`), `onComplete` sets `isDownloaded = true` and fetches GGUF metadata (`:304-317`), `onError` sets `this.downloadError` via `createErrorState(error,'download','huggingface',{modelId})` (`:319-337`).
3. `initializeStore` → `await downloadManager.syncWithActiveDownloads(this.models);` — `ModelStore.ts:763`.
4. `syncWithActiveDownloads` (`DownloadManager.ts:625-717`):
   - bails unless Android + module (`:626-628`)
   - `const activeDownloads = await NativeDownloadModule.getActiveDownloads();` `:633`
   - **reconciles by URL, not id**: `models.find(m => m.downloadUrl && download.url === m.downloadUrl)` `:641-643`; unmatched entries are `console.warn` + skipped `:646-650`
   - rebuilds a `DownloadJob` with `downloadId: download.id`, `lastBytesWritten = floor(model.size * progress/100)` `:664-692`
   - `this.downloadJobs.set(model.id, downloadJob)` `:695`
   - **fires `this.callbacks.onStart?.(model.id)`** `:701` — this is what makes the UI light up
   - `if (NativeDownloadModule.reattachDownloadObserver) await NativeDownloadModule.reattachDownloadObserver(download.id)` `:700-708` — guarded with an existence check, wrapped in its own try/catch `:709-713`

So after a kill: WorkManager keeps the job, `getActiveDownloads()` reports `{id,url,destination,progress,status}` (`DownloadModule.kt:177-185`), and the JS observable map is repopulated before the first frame of the models list. Speed/ETA are honestly faked as `'0 B/s'` / `l10n.common.calculating` until the first real progress tick (`:676-680`).

## 5. Error and retry semantics from JS

Failure surfaces via `onDownloadFailed` → `job.state.error = new Error(event.error)`, `isDownloading = false`, then `this.downloadJobs.delete(job.model.id)` (`DownloadManager.ts:172-178`) — **the job is removed**, so a failed download is no longer queryable through `downloadManager`. The only durable record is `modelStore.downloadError` (`ModelStore.ts:333-335`), which the UI renders as `DownloadErrorDialog`.

**Retry is not a native call.** `ModelStore.retryDownload` (`ModelStore.ts:3966-3976`) reads `this.downloadError?.metadata?.modelId`, clears the error, and re-runs `this.checkSpaceAndDownload(model.id)` → `downloadManager.startDownload(...)` (`:1622`) — a **brand-new native download from zero**. The native `retryDownload(downloadId)` verb exists and is implemented (`DownloadModule.kt:262`) but JS never calls it. Same for pause/resume: **no JS caller at all**, so there is no resume-from-partial in PocketPal's UI. The decision is entirely in JS, and it is "start over".

Cancelled downloads are distinguished from failures by a marker set (`DownloadManager.ts:481-518` `cancelledModelIds`, thrown as `DownloadCancelledError` `:29-35`) and honoured in the store: `if (err instanceof DownloadCancelledError) return;` `ModelStore.ts:1625-1630`.

## 6. Progress → UI

Native emits `onDownloadProgress {downloadId, bytesWritten, totalBytes, progress}` (`DownloadModule.kt:333-340`). Handler: `DownloadManager.ts:71-129`. It linear-scans `Array.from(this.downloadJobs.values()).find(j => j.downloadId === event.downloadId)` (`:78-81`), computes speed/ETA in JS from `lastUpdateTime`/`lastBytesWritten` deltas (`:86-108`), mutates `job.state.progress` inside `runInAction` (`:112-116`), and calls `this.callbacks.onProgress?.(job.model.id, progress)` (`:118`).

**No throttling in JS.** The only throttle is native: `progressInterval: 1000` passed in `DownloadConfig` (`DownloadManager.ts:492`) — i.e. 1 Hz requested from the platform, not enforced.

Chain: native event → `DownloadManager` listener → `callbacks.onProgress` → `ModelStore` writer (`ModelStore.ts:296-303`, sets `model.progress` + `model.downloadSpeed`) **and** the observable `job.state.progress` → `modelStore.activeDownloads` getter (`:1673-1690`) → `observer` components (`DownloadBanner.tsx:41,63`). Note the progress number reaches the UI via **two independent paths**: the callback (persisted model fields) and the MobX map. `DownloadBanner` clamps `Math.max(0, Math.min(100, visible.progress))` (`:63`).

## 7. What mine should copy

Mine: `lib/android-download-service.ts` (driver), `modules/expo-download/src/ExpoDownloadModule.ts` (module), `lib/download-service.ts:703-709` (`createDriver()` picks `AndroidDownloadService` when `androidDriverAvailable()`), `store/models/downloads.ts` (store wiring at `:236` progress callback, `:264` complete callback, `:436` `reconcileInterrupted`).

### Where theirs is better

- **Theirs actually reconciles at boot. Mine does not.** `syncWithActiveDownloads` (`DownloadManager.ts:625-717`) is called from `initializeStore` (`ModelStore.ts:763`) and rebuilds JS state from `getActiveDownloads()`. My `reconcileInterrupted` (`store/models/downloads.ts:436`) only stats files on disk (`getInfoAsync`, `:453`) and never calls `getActiveDownloads()`. Grep proves `getActiveDownloads` appears in exactly one non-comment place in the whole app: inside the poller (`lib/android-download-service.ts:121`), and `beginPolling()` is only reached from `startDownload` (`:112`) and `resumeDownload` (`:198`). **Consequence: after a process kill, an in-flight WorkManager job is invisible to my UI.** Events fire, but `apply()` early-returns on a mirror miss (`lib/android-download-service.ts:142-143` `if (!previous) return;`) and nothing is polling. `reconcileInterrupted` then marks the row `paused` from the partial file size, and the download keeps running unattended with no progress bar. This is a real bug, not a stylistic gap.
- **Their native module gets a real spec + codegen** (`src/specs/NativeDownloadModule.ts`, `package.json:138`), so the surface is checked by the compiler. Mine declares a hand-written `declare class ExpoDownloadModule extends NativeModule<ExpoDownloadEvents>` (`ExpoDownloadModule.ts:52`) that nothing validates against the Kotlin.
- **Their listener is set up once in the singleton constructor and torn down nowhere.** Mine registers a **new listener inside every `startDownload`** (`lib/android-download-service.ts:114`) and never removes it — N downloads ⇒ N listeners, each re-running `apply`.
- **Their `cancelDownload` deletes the partial file** (`DownloadManager.ts:521-543`) so a cancelled model doesn't silently occupy gigabytes. Mine calls native cancel (`:203`) and stops tracking, leaving whatever is on disk.

### Where mine is better

- Typed event payload end to end (`NativeDownload` interface, `ExpoDownloadModule.ts:35-44`) vs. PocketPal's untyped `event =>` handlers with implicit `any` (`DownloadManager.ts:71`).
- Real pause/resume/retry implemented in the native layer and actually reachable from JS (`ExpoDownloadModule.ts:58-60`), versus PocketPal's four dead native verbs.
- 1 Hz polling as the correctness backstop (`android-download-service.ts:118-133`) rather than trusting an emitter that drops events when JS is gone.
- Model identity passed explicitly in the request (`modelId` field) vs. PocketPal's fragile `download.url === m.downloadUrl` join (`DownloadManager.ts:641-643`), which breaks on any redirect or mirror and silently drops the download.
- Error carries a typed `errorCode` (`ExpoDownloadModule.ts:42`) vs. a bare string.
- Global callbacks are keyed on `job.modelId` so re-registration is idempotent (`store/models/downloads.ts:234-236`) — PocketPal's `setCallbacks` has last-writer-wins semantics (`DownloadManager.ts:222-224`).

### The 4 changes, in order

1. **Hydrate at boot.** Add `syncWithActiveDownloads` to the Android driver: call `getActiveDownloads()` from `store/models/persistence.ts` alongside `reconcileInterrupted` (`persistence.ts:68`), seed `this.mirror` for each record (which also fixes the `apply()` miss at `android-download-service.ts:143`), then `beginPolling()`. Without this, every other download feature in my app is dead after a kill.
2. **Move `addDownloadListener` out of `startDownload`** into the driver constructor (`android-download-service.ts:114`), keep the `EventSubscription`, and remove it in a `dispose()`. One listener, one lifetime.
3. **Join on `modelId`, not URL.** `NativeDownload.modelId` (`ExpoDownloadModule.ts:36`) is already in the durable record; use it in step 1 instead of a URL/filename heuristic.
4. **Unlink the partial on cancel**, mirroring `DownloadManager.ts:521-543`, so cancelled models release disk.

Skipped: reworking `createDriver()`'s dual-driver abstraction (`lib/download-service.ts:703-709`) — it is the reason both drivers exist and it is not the problem. Add a TurboModule spec only if the Kotlin surface starts drifting; the hand-written `declare` is not currently the bug.
