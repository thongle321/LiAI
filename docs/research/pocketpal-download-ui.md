# PocketPal AI — how the model download / model list stays responsive

Repo read: `D:/aivision/pocketpal-ai` (vendored copy, v1.19.1 per `package.json:4`).
All claims below are cited as `path:line` against that copy.

> **Correction to the premise up front:** this app does **not** use Zustand. It uses
> **MobX** (`package.json:57-58` `"mobx": "^6.15.0"`, `"mobx-react": "^9.2.1"`,
> plus `mobx-react-lite` imported per-file). There are no Zustand slices, no
> selector-based subscriptions and no `useShallow` anywhere in the vendored copy.

---

## 1. Where the download actually happens

**Two different implementations, one per platform.** There is no Swift download
module — the iOS transfer is driven from JS through `react-native-fs`.

### Android — native Kotlin (OkHttp inside WorkManager)

- Worker: `android/app/src/main/java/com/pocketpalai/download/DownloadWorker.kt`
- TurboModule facade: `android/app/src/main/java/com/pocketpalai/download/DownloadModule.kt`
- JS spec: `src/specs/NativeDownloadModule.ts:26-45`
- Room-backed job record: `android/app/src/main/java/com/pocketpalai/download/DownloadEntity.kt`, `DownloadDao.kt`, `DownloadDatabase.kt`

`DownloadWorker.kt:20-23` — the HTTP client:

```kotlin
private val client = OkHttpClient.Builder()
    .addInterceptor(ProgressInterceptor())
    .build()
```text

`DownloadWorker.kt:33` — the whole transfer runs off the main thread:

```kotlin
override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
```

WorkManager is used so the download survives process death — `DownloadModule.kt:110-116`:

```kotlin
val workRequest = DownloadWorker.createWorkRequest(downloadId, progressInterval)
...
workManager.enqueueUniqueWork(
    getWorkName(downloadId),
    androidx.work.ExistingWorkPolicy.REPLACE,
    workRequest
)
```text

### Destination file name / path

Resolved in JS before the native call: `ModelStore.ts:1620-1622`

```ts
const destinationPath = await this.getModelFullPath(model);
const authToken = hfStore.shouldUseToken ? hfStore.hfToken : null;
await downloadManager.startDownload(model, destinationPath, authToken);
```

`ModelStore.getModelFullPath` — `src/store/ModelStore.ts:1274`, doc block at `:1260-1268`:

```text
 * - HF: Uses DocumentDirectoryPath/models/hf/author/filename
```

i.e. `${RNFS.DocumentDirectoryPath}/models/hf/<author>/<repo>/<filename>.gguf`.

### Temp / partial-file strategy — **no `.tmp` + rename**

A repo-wide grep for `.tmp` / `.partial` / `renameTo` across `src/` and
`android/app/src/main/java/` returns **zero** download-related hits (only
`Message.partial` chat-streaming fields and a JSdoc link). The byte stream is
written **directly to the final destination path** and correctness is
recovered by *size*, not by an atomic rename:

- Android append/overwrite decision — `DownloadWorker.kt:194-197`:
  ```kotlin
  val appendMode = file.exists() && response.code == 206
  Log.d(TAG, "Opening file in ${if (appendMode) "append" else "overwrite"} mode")
  
  FileOutputStream(file, appendMode).buffered().use { output ->
  ```
- iOS writes straight to `toFile: destinationPath` — `src/services/downloads/DownloadManager.ts:332-337`.

### Resume / range requests — Android only, real `Range` support

`DownloadWorker.kt:81-86`:

```kotlin
.apply {
    if (file.exists() && file.length() > 0) {
        val range = "bytes=${file.length()}-"
        Log.d(TAG, "Resuming download from byte ${file.length()}")
        addHeader("Range", range)
    }
```text

Total-bytes accounting across a 206 — `DownloadWorker.kt:174-186`
(`206 -> bytesWritten + contentLength`, `200 -> contentLength`).

Failure modes are handled explicitly:
- server ignores the range (`200` with an existing partial) → delete the partial and restart — `DownloadWorker.kt:120-126`
- `416` → delete partial, mark FAILED — `DownloadWorker.kt:127-142`
- `5xx` → `Result.retry()` with exponential backoff — `DownloadWorker.kt:147-151`, backoff at `DownloadWorker.kt:296-299`

File/DB reconciliation on restart (size is the source of truth) —
`DownloadWorker.kt:64-76`.

### iOS

`src/services/downloads/DownloadManager.ts:332-341`:

```ts
const downloadResult = RNFS.downloadFile({
  fromUrl: model.downloadUrl!,
  toFile: destinationPath,
  background: uiStore.iOSBackgroundDownloading,
  discretionary: false,
  progressInterval: 800,
```

Platform fork: `DownloadManager.ts:296-303` (`Platform.OS === 'ios' ? startIOSDownload : startAndroidDownload`).
Native module is Android-only: `src/specs/NativeDownloadModule.ts:47-49`.

### Dead code worth knowing about

`android/app/src/main/java/com/pocketpalai/download/ProgressResponseBody.kt` +
`ProgressInterceptor` (`DownloadWorker.kt:301-311`) wrap the OkHttp body and
count `totalBytesRead` (`ProgressResponseBody.kt:22-35`) but **never emit
anything**. Actual progress comes from the manual read loop, not the
interceptor.

---

## 2. Progress reporting path

Push-based, native → JS event emitter. No polling, no JS interval.

```text
OkHttp read loop (Kotlin, Dispatchers.IO)
  → WorkManager setProgress(workDataOf(...))      DownloadWorker.kt:232-237
  → WorkInfo LiveData observer                    DownloadModule.kt:434-447
  → sendProgressEvent() → RCTDeviceEventEmitter   DownloadModule.kt:333-341, 42-48
  → NativeEventEmitter 'onDownloadProgress'       DownloadManager.ts:68-70
  → MobX observable write                          DownloadManager.ts:124-131
```

`DownloadModule.kt:333-341`:

```kotlin
private fun sendProgressEvent(downloadId: String, bytesWritten: Long, totalBytes: Long) {
    val params = Arguments.createMap().apply {
        putString("downloadId", downloadId)
        putDouble("bytesWritten", bytesWritten.toDouble())
        putDouble("totalBytes", totalBytes.toDouble())
        putDouble("progress", if (totalBytes > 0) (bytesWritten.toDouble() / totalBytes.toDouble()) * 100 else 0.0)
    }
    sendEvent("onDownloadProgress", params)
```text

### Update rate and throttling

Throttling is **entirely native-side**, by wall-clock interval:

`DownloadWorker.kt:230-240`:

```kotlin
val currentTime = System.currentTimeMillis()
if (currentTime - lastProgressUpdate >= progressInterval) {
    val progress = workDataOf(
        KEY_PROGRESS to bytesWritten,
        KEY_TOTAL to totalBytes
    )
    Log.d(TAG, "Progress: $bytesWritten/$totalBytes bytes for ID: $downloadId")
    setProgress(progress)
    downloadDao.updateProgress(downloadId, bytesWritten, totalBytes, DownloadStatus.RUNNING)
    lastProgressUpdate = currentTime
}
```

- Android default `DEFAULT_PROGRESS_INTERVAL = 1000L` — `DownloadWorker.kt:279`
- Android value sent from JS is `progressInterval: 1000` — `DownloadManager.ts:491-497`
- iOS `progressInterval: 800` — `DownloadManager.ts:337`

So **≈1 tick/second (Android), ≈1.25 ticks/second (iOS)**. There is **no
additional coalescing, debouncing or throttling on the JS side** — every native
tick lands directly in an observable write.

Other events, same emitter: `onDownloadComplete` (`DownloadManager.ts:134`),
`onDownloadFailed` (`DownloadManager.ts:166`), `onDownloadCancelled`
(`DownloadModule.kt:349-356`).

### Crash / process-death recovery

`syncWithActiveDownloads` — `DownloadManager.ts:624-624+`; rebuilds JS jobs from
the Room table and re-registers the native observer via
`NativeDownloadModule.reattachDownloadObserver` (`DownloadManager.ts:700-712`,
`DownloadModule.kt:130-152`). Called from `ModelStore.ts:763`.

---

## 3. Store updates (MobX, not Zustand)

### The observable job map

`src/services/downloads/DownloadManager.ts:51-58`:

```ts
this.downloadJobs = observable.map(new Map());
makeAutoObservable(this);
```text

Per-tick write, `DownloadManager.ts:92-131` (abridged):

```ts
// Calculate speed
const currentTime = Date.now();
const timeDiff = (currentTime - job.lastUpdateTime) / 1000 || 1;
const bytesDiff = event.bytesWritten - job.lastBytesWritten;
const speedBps = bytesDiff / timeDiff;
...
const progress: DownloadProgress = {
  bytesDownloaded: event.bytesWritten,
  bytesTotal: event.totalBytes,
  progress: event.progress,
  speed: `${formatBytes(event.bytesWritten)} (${speedMBps} MB/s)`,
  eta: etaText,
  rawSpeed: speedBps,
  rawEta: etaSeconds,
};

// Update job state
runInAction(() => {
  job.state.progress = progress;
  job.lastBytesWritten = event.bytesWritten;
  job.lastUpdateTime = currentTime;
});

this.callbacks.onProgress?.(job.model.id, progress);
```

A **fresh object is assigned every tick** (`job.state.progress = progress`,
`DownloadManager.ts:126`), so MobX always sees a changed reference → always
notifies.

### The store action components actually render

`src/store/ModelStore.ts:294-303` (registered in the store constructor):

```ts
downloadManager.setCallbacks({
  onProgress: (modelId, progress) => {
    const model = this.models.find(m => m.id === modelId);
    if (model) {
      runInAction(() => {
        model.progress = progress.progress;
        model.downloadSpeed = `${progress.speed} ${uiStore.l10n.common.downloadETA}: ${progress.eta}`;
      });
    }
  },
```text

Completion, same block — `ModelStore.ts:304-318`, which is also where the
post-download GGUF metadata fetch kicks in (see §6).

### The reactive list the banner reads

`ModelStore.ts:1670-1693`:

```ts
/**
 * Reactive list of in-flight downloads. Each entry carries the Model object
 * plus the latest formatted progress strings so observers can render a
 * banner / sheet / list row without re-deriving anything per frame.
 */
get activeDownloads(): Array<{...}> {
  return downloadManager.activeJobs.map(job => ({
    modelId: job.model.id,
    model: job.model,
    progress: job.state.progress?.progress ?? 0,
    ...
```

Declared as a cached computed at `ModelStore.ts:267`
(`makeAutoObservable(..., { activeDownloads: computed })`).

### Subscription granularity

MobX `observer` gives **per-property** granularity (this is the analogue of a
Zustand selector here — no `useShallow` equivalent needed):

- `ModelCard` is `observer(...)` — `src/screens/ModelsScreen/ModelCard/ModelCard.tsx:83`. It reads `model.progress` / `model.downloadSpeed` **only inside** the `isDownloading` branch (`ModelCard.tsx:799-812`), so a tick for model A does **not** re-render model B's card.
- `DownloadBanner` is `observer` — `src/components/DownloadOverlay/DownloadBanner.tsx:34`, and it early-returns when nothing is downloading (`:41-45`).
- `DownloadOverlay` is `observer` — `src/components/DownloadOverlay/DownloadOverlay.tsx:20`.

Counter-caveat: `ModelsScreen` is also an `observer` (`ModelsScreen.tsx:34`) and
reads `modelStore.displayModels` (`ModelsScreen.tsx:~296`) — but that computed
depends on `isDownloaded`, not `progress`, so per-tick progress writes do **not**
invalidate it. The screen itself is not re-rendered per tick; the one card that
is downloading is.

**There is no `React.memo` on `ModelCard`** and styles are rebuilt on every
render (`ModelCard.tsx:87`, `ModelsScreen.tsx:57`: `const styles = createStyles(theme)`).

---

## 4. What the model list screen renders during download

### Screen + row files

| Role | File |
| --- | --- |
| Screen | `src/screens/ModelsScreen/ModelsScreen.tsx` |
| Row | `src/screens/ModelsScreen/ModelCard/ModelCard.tsx` |
| Group accordion | `src/screens/ModelsScreen/ModelAccordion/ModelAccordion.tsx` |
| Global banner | `src/components/DownloadOverlay/DownloadBanner.tsx` (hosted by `DownloadOverlay.tsx`) |
| Reusable card | `src/components/DownloadProgressCard/DownloadProgressCard.tsx` |

### Virtualization: two nested FlatLists

Outer list of groups, `ModelsScreen.tsx:397-406`:

```tsx
<FlatList
  testID="flat-list"
  ...
  data={flatListModels}
  keyExtractor={item => item.type}
  extraData={activeModelId}
  renderItem={renderGroupHeader}
```text

Each group header contains its **own inner FlatList** of cards —
`ModelsScreen.tsx:362-373`:

```tsx
<FlatList
  data={group.items}
  keyExtractor={subItem => subItem.id}
  renderItem={({item: subItem}) => (
    <ModelCard
      model={subItem}
      activeModelId={activeModelId}
      onOpenSettings={() => handleOpenSettings(subItem)}
      onOpenServerDetails={handleOpenServerDetails}
    />
  )}
/>
```

Honest caveat: nesting a `VirtualizedList` inside another `VirtualizedList`
(the classic RN anti-pattern, and React Native warns about it at runtime) means
the inner list is the non-scrolling one and its windowing is effectively
"render whatever the outer list mounted". Collapsed groups are not mounted at
all, which is the only thing keeping the mounted card count bounded.

### The per-item download row — plain React, no Reanimated

`ModelCard.tsx:798-813`:

```tsx
{/* Download Progress */}
{isDownloading && (
  <View style={styles.downloadProgressContainer}>
    <ProgressBar
      testID="download-progress-bar"
      progress={model.progress / 100}
      color={theme.colors.tertiary}
      style={styles.progressBar}
    />
    {model.downloadSpeed && (
      <Text style={styles.downloadSpeed}>
        {model.downloadSpeed}
      </Text>
    )}
  </View>
)}
```text

That is react-native-paper's `ProgressBar` driven by an observable prop — a
re-render + style update per tick, on the JS thread.

Same pattern in the other two progress surfaces, both as an inline percentage
width (no animated value):

- `DownloadBanner.tsx:102-104`:
  ```tsx
  <View style={styles.track}>
    <View style={[styles.fill, {width: `${clamped}%`}]} />
  ```
- `DownloadProgressCard.tsx:51-52`: identical `{width: \`${clamped}%\`}`.

**Reanimated is not used anywhere in the download UI.** A repo-wide grep for
`react-native-reanimated` / `useSharedValue` / `useAnimatedStyle` hits only
`ChatView.tsx`, `Sheet/*`, `ui/Stepper/Stepper.tsx` and tests — never
`ModelCard`, `DownloadBanner` or `DownloadProgressCard`. `react-native-reanimated`
is a dependency (`package.json:81`) but unused here.

**`DownloadProgressCard` is not actually consumed by any screen.** Its only
references are its own file, its `index.ts`, and the barrel export at
`src/components/index.ts:64` (verified by repo-wide grep). Its doc comment
(`DownloadProgressCard.tsx:23-27`) claims it is used by `DownloadSheet` and the
Models/PalsHub rows; the actual rendering is `ModelCard` + `DownloadBanner`.

---

## 5. What is explicitly done to avoid blocking

| Technique | Where |
| --- | --- |
| HTTP transfer on `Dispatchers.IO` in a WorkManager worker (never JS, never main) | `DownloadWorker.kt:33` |
| Native wall-clock throttle before *any* bridge crossing (1000 ms / 800 ms) | `DownloadWorker.kt:230-240`; `DownloadManager.ts:337`, `:495` |
| Per-model `runInAction` writes; observers are per-model so only the downloading card re-renders | `DownloadManager.ts:124-129`; `ModelStore.ts:298-301`; `ModelCard.tsx:83`, `:799` |
| Speed + ETA formatted **once per tick** into a string, and the string is what the UI reads (no per-render formatting) | `DownloadManager.ts:92-117`; `ModelStore.ts:300`; `ModelCard.tsx:807-811` |
| `activeDownloads` computed pre-packages name + progress + labels so the banner "does not re-derive anything per frame" | `ModelStore.ts:1670-1693` (doc comment at `:1670-1673`) |
| Disk-space checks batched on a **10 s interval**, not per progress tick | `src/hooks/useStorageCheck.ts:20-24`, `:88-92`; wired per card at `ModelCard.tsx:110-115` |
| GGUF metadata load explicitly fire-and-forget: *"Fetch in background, don't block startup"* | `ModelStore.ts:1954-1985` |
| `observer` early-return when nothing is downloading (banner mounts nothing) | `DownloadBanner.tsx:41-45` |

**Not done** (verified absent, not guessed):

- No `React.memo` on `ModelCard` (memo is used elsewhere in the app — e.g. `Avatar.tsx:8`, `MarkdownView.tsx:29`, `SidebarContent.tsx:57` — just not on the model row).
- No JS-side throttle/debounce/`requestAnimationFrame` batching of ticks.
- No Reanimated worklet for the progress bar.
- `createStyles(theme)` is re-invoked per render of both screen and row (`ModelsScreen.tsx:57`, `ModelCard.tsx:87`).
- `extraData={activeModelId}` on the outer list (`ModelsScreen.tsx:404`) — not `activeDownloads`; list refresh is driven by MobX instead.

---

## 6. Model metadata / GGUF parsing and other heavy JS work

### After download completes

`ModelStore.ts:304-318`:

```ts
onComplete: async modelId => {
  const model = this.models.find(m => m.id === modelId);
  if (model) {
    runInAction(() => {
      model.progress = 100;
      model.isDownloaded = true;
    });

    // Fetch and persist GGUF metadata after download completes
    // Skip for projection models (CLIP) - they have different metadata structure
    if (model.modelType !== ModelType.PROJECTION) {
      await this.fetchAndPersistGGUFMetadata(model);
    }
  }
},
```

`fetchAndPersistGGUFMetadata` (`ModelStore.ts:1838-1952`) delegates the actual
header read to **native** llama.rn — `ModelStore.ts:1848`:

```ts
const modelInfo = await loadLlamaModelInfo(filePath);
```text

Everything after that is pure JS arithmetic on a small key map
(`ModelStore.ts:1854-1948`). Cheap, and off the critical path.

### The one deliberately clever JS parser

`src/utils/ggufHeader.ts` is a hand-written GGUF header reader that runs **in
JS over HTTP range requests** (used by the remote MTP probe, `src/utils/mtp.ts:66`
— not part of the download flow). Its header explains the whole optimization,
`ggufHeader.ts:1-20`:

```
 * A general-purpose parser must materialize every metadata value — including
 * the ~10^5-string tokenizer vocab that dominates a header — before the caller
 * can look at any of it. This reader instead *seeks past* every value it does
 * not need using GGUF's length-prefixed encoding, so the vocab is walked with
 * integer reads only: no string materialization, no `TextDecoder` (Hermes has
 * none), a few short ASCII-range key decodes instead of ~10^6 of them.
```text

Hard caps keep it bounded — `ggufHeader.ts:22-30`:

```ts
const HTTP_CHUNK_SIZE = 2 * 1024 * 1024;
const HTTP_TOTAL_MAX = 64 * 1024 * 1024;

const MAX_KV_COUNT = 4096;
const MAX_TENSOR_COUNT = 65536;
```

### Things that are *not* on the download path

- `initLlama` is only called on an explicit user "Load" — `ModelStore.ts:2326-2335`. Its progress callback body is empty (`ModelStore.ts:2332-2334`).
- `checkModelFileIntegrity` runs per downloaded card on mount (`ModelCard.tsx:141-149`) but is a **`RNFS.stat` size comparison**, not a hash — `src/utils/index.ts:582-596` (`// If size difference is more than 0.1%...`).

---

## What to copy

Five things, each directly liftable. LiAI-relevant and each with its source.

1. **Throttle on the native side, at the byte loop, before the bridge.**
   PocketPal never lets the socket drive progress frequency. One wall-clock
   check inside the read loop caps the whole app at ~1 event/second, and the JS
   side does zero extra filtering.
   → copy `DownloadWorker.kt:230-240` (the `if (currentTime - lastProgressUpdate >= progressInterval)` guard) and the default `DownloadWorker.kt:279`.
   On iOS the equivalent one-liner is `progressInterval: 800` at `DownloadManager.ts:337`.

2. **Keep the transfer in a resumable, range-capable, off-main-thread job, and reconcile by file size on restart.**
   `Range: bytes=<len>-` + append on 206 (`DownloadWorker.kt:81-86`, `:194-197`), restart-from-zero when the server ignores the range (`DownloadWorker.kt:120-126`), and a size-vs-DB reconciliation on worker start (`DownloadWorker.kt:64-76`).
   Note: PocketPal writes **directly to the final path with no `.tmp`+rename**. Copy the resume logic, not that omission — a `.part` + rename is strictly safer and costs three lines.

3. **Mutate a *per-item* observable from a callback, and let each row subscribe individually.**
   The store action is two lines in `runInAction` on one model's object
   (`ModelStore.ts:295-302`), and each row observes only its own model
   (`ModelCard.tsx:83`, `:799-812`). In Zustand the exact equivalent is a
   `progress: Record<string, Progress>` map plus a `useStore(s => s.progress[id])`
   selector in the row — never one top-level `progress` number, which would
   re-render every row on every tick.

4. **Pre-format every display string in the store tick; let the row render dumb strings.**
   Speed and ETA are computed and stringified once per tick
   (`DownloadManager.ts:92-117`) and stored on the model
   (`ModelStore.ts:300`); the row just prints `model.downloadSpeed`
   (`ModelCard.tsx:807-811`). Move `formatBytes`/ETA math out of `render`, or
   every re-render of every card pays for it.

5. **Batch all ancillary disk polling on its own slow interval, decoupled from progress.**
   Free-space checks run on a 10 s timer, not per progress tick
   (`useStorageCheck.ts:20-24`, `:88-92`), and GGUF metadata hydration is
   fire-and-forget with the explicit comment *"Fetch in background, don't block
   startup"* (`ModelStore.ts:1970-1984`). In a list screen both of these are the
   classic accidental per-tick disk reads — copy the 10 s interval and the
   fire-and-forget.

**Bonus, if you want a global indicator:** the `DownloadOverlay` +
`DownloadBanner` pair (`DownloadOverlay.tsx:19-45`, `DownloadBanner.tsx:34-45`)
shows the "one sticky row above the navigator with a `+N` badge for the rest,
tapping through to the models screen" pattern, backed by a single computed list
(`ModelStore.ts:1670-1693`) so the banner never re-derives anything per frame.

### Do **not** copy from PocketPal

- Progress bars are plain React state + inline `width: %` (`DownloadBanner.tsx:103`, `DownloadProgressCard.tsx:52`), not Reanimated shared values. With 1 tick/s this is fine; if you push ticks to 60 fps, use `useSharedValue` + `useAnimatedStyle` so the bar never touches React.
- No `React.memo` on the row, and `createStyles(theme)` is rebuilt every render (`ModelCard.tsx:87`).
- Nested `FlatList` inside `FlatList` (`ModelsScreen.tsx:362-373`).
- `DownloadProgressCard` is dead code — exported at `src/components/index.ts:64`, rendered nowhere.