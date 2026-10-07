# Hugging Face file-download request path — LiAI vs PocketPal

Scope: **the HF file-download request path only** (URL → headers → redirect → bytes → disk).
General progress-throttling is covered by `docs/research/pocketpal-download-ui.md`.

Sources (primary, read as source code):
- LiAI: `lib/models/huggingface.ts`, `lib/download-service.ts`, `store/models/downloads.ts`,
  `lib/hf-token.ts`, `lib/models/hf-warnings.ts`, `lib/models/hf-format.ts`,
  `lib/models/resume-state.ts`.
- PocketPal (vendored): `pocketpal-ai/src/config/urls.ts`, `src/utils/hf.ts`, `src/api/hf.ts`,
  `src/utils/hfUserAgent.ts`, `src/services/downloads/DownloadManager.ts`,
  `src/store/ModelStore.ts`, `src/store/HFStore.ts`, `src/utils/errors.ts`,
  `android/.../download/DownloadWorker.kt`, `DownloadModule.kt`, `ProgressResponseBody.kt`.
- The transfer layer LiAI actually rides: `node_modules/expo-file-system/{android,ios}`.

Where a claim is about third-party platform behaviour it is marked **[platform]** and the
determining line in *this* repo is cited; the platform rule itself is quoted from upstream source.

---

## 1. URL construction

**LiAI** — one builder, no revision pinning, no encoding:

```ts
// lib/models/huggingface.ts:577-579
export function hfDownloadUrl(modelId: string, path: string): string {
  return `${HF_HUB_BASE}/${modelId}/resolve/main/${path}`;
}
```

`HF_HUB_BASE = "https://huggingface.co"` (`huggingface.ts:26`). Callers pass a raw
`f.path` straight from the tree API (`huggingface.ts:568`). Preset rows carry the same
`resolve/main` shape hardcoded (`huggingface.ts:84-86` etc.). Revision is hardcoded `main`.

**PocketPal** — same shape, same base, same non-encoding:

```ts
// pocketpal-ai/src/config/urls.ts:3-4, 17-19
export const HF_DOMAIN = 'https://huggingface.co';
export const HF_API_BASE = `${HF_DOMAIN}/api/models`;
modelDownloadFile: (modelId, filename) =>
    `${HF_DOMAIN}/${modelId}/resolve/main/${filename}`,
```

Applied at `src/utils/hf.ts:39` (`url: urls.modelDownloadFile(modelId, sibling.rfilename)`).
Device-rule presets build it by hand too (`src/services/deviceRules/parse.ts:198`,
`src/store/onboarding/onboardingPals.ts:71`).

Side-by-side:

| | LiAI | PocketPal |
|---|---|---|
| base | `https://huggingface.co` (`huggingface.ts:26`) | `https://huggingface.co` (`urls.ts:3`) |
| shape | `{base}/{modelId}/resolve/main/{path}` (`huggingface.ts:578`) | `{base}/{modelId}/resolve/main/{filename}` (`urls.ts:18`) |
| revision | literal `main` | literal `main` |
| `?download=true` | absent | absent |
| `api/models/{id}/revision` | not used for files | not used for files (`urls.ts:12-14` only `tree/main`) |
| `%`-encoding of filename | **none** | **none** |
| `hf.co` org prefix | irrelevant — the org is part of `modelId` and interpolated verbatim, same as PocketPal | same |

Findings:

- **No `?download=true` on either side.** `resolve/main/<path>` 302s to the CDN on its own;
  the query param is a browser/Content-Disposition nicety. Not a bug, but worth writing down
  so nobody "fixes" it later.
- **No revision pinning.** Both resolve `main` at request time. This is the root of the
  splice risk in §6.
- **No percent-encoding.** A repo whose GGUF lives in a subfolder (`recursive=true` is
  requested at `huggingface.ts:557`, so nested paths are reachable) yields
  `.../resolve/main/Q4_K_M/model.gguf`, which HF's router resolves as a *path*, not as a
  filename. Same on PocketPal (`sibling.rfilename` can contain `/`). Neither side has an
  encoder; neither has a test. Files with a literal `/` in the name are impossible on HF,
  so this only bites for nested subfolders — a real case for GGUF repos that version their
  quants in subdirectories.
- `getModelFiles` name mapping takes `f.path.split("/").pop()` (`huggingface.ts:567`) while the
  URL keeps the full `f.path` (`huggingface.ts:568`) — so the local filename drops the subfolder
  but the URL keeps it. Correct, and PocketPal behaves the same via `rfilename`.

---

## 2. Redirects to the CDN — is the `Authorization` header leaked?

HF `resolve` answers `302` with a `Location` on `cdn-lfs*.hf.co` / `cas-bridge.xethub.hf.co`.
Neither side implements redirect handling itself; both delegate to the platform HTTP client.

### Android

**LiAI (expo-file-system legacy).** The shared client is built with timeouts only:

```kotlin
// node_modules/expo-file-system/android/.../legacy/FileSystemLegacyModule.kt:992-1000
private val okHttpClient: OkHttpClient?
  get() {
    if (client == null) {
      val builder = OkHttpClient.Builder()
        .connectTimeout(60, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
      client = builder.build()
```

No `followRedirects(...)`, no `followSslRedirects(...)`, no network interceptor. The only thing
added for downloads is a **response**-side interceptor that wraps the body:

```kotlin
// FileSystemLegacyModule.kt:648-655
val client = okHttpClient?.newBuilder()
  ?.addInterceptor { chain ->
    val originalResponse = chain.proceed(chain.request())
    originalResponse.newBuilder()
      .body(ProgressResponseBody(originalResponse.body, progressListener))
      .build()
  }
  ?.build()
```

Both are **application** interceptors (`addInterceptor`, not `addNetworkInterceptor`), so they
run once around the whole chain. Neither touches request headers. Dependency pinned at
`node_modules/expo-file-system/android/build.gradle:24` → `com.squareup.okhttp3:okhttp:4.9.2`.

**PocketPal.** Same shape, its own client:

```kotlin
// pocketpal-ai/android/.../download/DownloadWorker.kt:23-25
private val client = OkHttpClient.Builder()
    .addInterceptor(ProgressInterceptor())
    .build()
```

No `followRedirects`, no auth interceptor. `ProgressInterceptor` (`DownloadWorker.kt:311-319`)
is response-only. Dependency: `android/app/build.gradle:232` → `okhttp:4.12.0`.

**The stripping rule (upstream source, verbatim):**

```kotlin
// square/okhttp parent-4.12.0 okhttp/src/main/kotlin/okhttp3/internal/http/RetryAndFollowUpInterceptor.kt
// buildRedirectRequest:
if (!userResponse.request.url.canReuseConnectionFor(url)) {
    requestBuilder.removeHeader("Authorization")
}
```

(identical code in 4.9.2; `canReuseConnectionFor` is same scheme+host+port.)

**Verdict: no leak on Android, on either side.** Both clients are stock OkHttp with stock
follow-up behaviour; the token is attached once to the `huggingface.co` request
(`DownloadWorker.kt:91`, `downloads.ts:187-192`) and OkHttp drops it when the 302 crosses to a
different host. There is no interceptor that re-adds it per hop — that would be the leak, and
there is none.

### iOS

LiAI uses `URLSession` with the token in the request headers:

```swift
// node_modules/expo-file-system/ios/Legacy/FileSystemLegacyModule.swift:275-279
if let resumeDataString, let resumeData = Data(base64Encoded: resumeDataString) {
  task = session.downloadTask(withResumeData: resumeData)
} else {
  let request = createUrlRequest(url: sourceUrl, headers: options.headers)
  task = session.downloadTask(with: request)
}
```

PocketPal uses RNFS's `downloadFile` with the same headers (`DownloadManager.ts:332-341`).
**Neither installs a redirect delegate** — no `willPerformHTTPRedirection`, and no
`URLSessionConfiguration.httpAdditionalHeaders` (so nothing that Foundation would re-inject on
every hop). Behaviour is therefore whatever Foundation's default is.

> **[platform] Unverified.** Apple's documentation for `URLSession` and for
> `urlSession(_:task:willPerformHTTPRedirection:newRequest:completionHandler:)` does not state
> in a quotable way whether request-level `Authorization` survives a cross-origin redirect, and
> no Foundation source is vendored in this workspace. I could not verify it from a primary
> source, so I am not claiming it. This is the one open item on the highest-value question.

Given Android is verified safe, the practical risk is iOS-only and unverifiable from here. The
cheap mitigation that closes it regardless of platform behaviour is in §"What to change" #1 —
it is worth doing even though I cannot prove a leak.

### Token host-gate (defence in depth, both sides)

Both gate the token on the URL host — and they differ in strictness:

```ts
// LiAI, lib/models/huggingface.ts:582-588
export function isHuggingFaceUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith("huggingface.co");
  } catch { return false; }
}
```

```ts
// PocketPal, src/services/downloads/DownloadManager.ts:37-46
const isHuggingFaceUrl = (url) => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.host === 'huggingface.co';
  } catch { return false; }
};
```

LiAI's `.endsWith("huggingface.co")` also accepts `evil-huggingface.co` and `http://`
(non-TLS) — a real (if currently unreachable) weakness given every URL LiAI downloads comes from
its own builder. Exact-host + https-exact is the correct predicate and PocketPal already has it.

---

## 3. Auth, gated repos, error surfacing

**Header:** both send `Authorization: Bearer <token>`.

```ts
// LiAI
// store/models/downloads.ts:187-192
headers: {
  "User-Agent": HF_USER_AGENT,
  ...(auth && isHuggingFaceUrl(activeFile.downloadUrl)
    ? { Authorization: `Bearer ${auth}` } : {}),
},
// lib/models/huggingface.ts:450
if (token) headers["Authorization"] = `Bearer ${token}`;
```

```kotlin
// PocketPal
// DownloadWorker.kt:80-93
.addHeader("User-Agent", "PocketPal/${BuildConfig.VERSION_NAME} (ai.pocketpal)")
.apply {
    if (file.exists() && file.length() > 0) { addHeader("Range", "bytes=${file.length()}-") }
    download.authToken?.let { token -> addHeader("Authorization", "Bearer $token") }
}
```

`Authorization: token …` (the legacy scheme) is used by neither. Good.

**User-Agent:** LiAI `LiAI/1.0.0` (`huggingface.ts:36`); PocketPal
`PocketPal/<version> (ai.pocketpal)` (`src/utils/hfUserAgent.ts:7-8`). Both always send it —
LiAI's comment at `huggingface.ts:32-34` says HF's CDN refuses anonymous clients. PocketPal's
Android UA comes from `BuildConfig.VERSION_NAME` directly (`DownloadWorker.kt:80`), iOS from
`DeviceInfo.getVersion()` (`DownloadManager.ts:339`) — same string either way.

**Token source.** LiAI: SecureStore, hydrated into the store (`store/models/persistence.ts:108-119`),
selected by `activeHfToken` (`lib/hf-token.ts:20-28` — explicit override wins, else stored token
only while the "Use HF Token" switch is on). PocketPal: Keychain (`HFStore.ts:89-97`),
gated by `shouldUseToken` (`HFStore.ts:77-79`). Structurally equivalent.

**401/403 on the API (search/tree).**

LiAI collapses both into one code:

```ts
// lib/models/huggingface.ts:465-467
if (resp.status === 401 || resp.status === 403) {
  throw new HfError("check your Hugging Face token", "authentication");
}
```

`HfError.code` is only `"authentication" | "network" | "unknown"` (`huggingface.ts:434-444`),
so a 403 *authorization* failure (gated, not accepted) is reported as "check your token".
PocketPal distinguishes them: `createErrorState` maps 401→`authentication`, 403→`authorization`
with distinct copy (`src/utils/errors.ts:88-100`, strings at `src/locales/en.json:1433-1437`),
and the search empty state renders a "Disable token & retry" button only for
`code === 'authentication'` (`src/screens/.../SearchView.tsx:157-168`). LiAI has the same
escape hatch (`store/models/catalog.ts:161-167`) driven off `HfError.code`.

**401/403 on the file download itself.** This is where the two diverge hard.

- LiAI: `fail(\`HTTP ${result.status}\`)` (`lib/download-service.ts:232-234`). The raw code
  reaches the model row; no mapping to a token hint, no `HfError`, nothing actionable.
  On retry the same 401 recurs with the same opaque text. **But** see §5 — by the time the
  status is inspected, the error body has already been written into the `.gguf`.
- PocketPal (Android): explicit branch — 416 → fail with "partial download was invalid or the
  file on server has changed" (`DownloadWorker.kt:129-143`), other 4xx → `"Client error: ${code}"`
  (`:145-149`), 5xx → retry (`:151-155`). Still no 401/403-specific copy.
- PocketPal (iOS): `throw new Error(\`Download failed with status: ${result.statusCode}\`)`
  (`DownloadManager.ts:436`).

**HEAD / Range preflight: neither side does one.** Grepping the whole LiAI download path, the
only network call is the single GET that carries the body. There is no probe to learn the real
size or to validate the token before committing to a multi-GB transfer; the expected size comes
from the Hub tree API's `lfs.size` (`huggingface.ts:566`) and is trusted all the way to the
post-download size check (`download-service.ts:238-252`). PocketPal likewise: one request
(`DownloadWorker.kt:78-119`), no probe. Its iOS path reads `res.contentLength` from the
response `begin` callback (`DownloadManager.ts:345`) — a response header, not a preflight.

**`hf-warnings.ts` is not an error surface.** It is four pre-download chips
(`lib/models/hf-warnings.ts:45-73`): `not-enough-space`, `short-memory`,
`multimodal-without-projector`, `legacy-quantization`. Nothing in it inspects a status code, and
nothing in the download path calls it — it runs on the card/snackbar before bytes move. The only
real pre-flight in LiAI's download path is the free-space check
(`store/models/downloads.ts:211-217`).

---

## 4. Rate limits and retries

**PocketPal retries, with backoff, inside WorkManager.**

```kotlin
// DownloadWorker.kt:285-288
.setBackoffCriteria(
    BackoffPolicy.EXPONENTIAL,
    WorkRequest.MIN_BACKOFF_MILLIS,
    java.util.concurrent.TimeUnit.MILLISECONDS
)
```

and returns `Result.retry()` for 5xx (`DownloadWorker.kt:151-155`) and for a pause detected
mid-transfer (`:224-227`). There is **no `setMaxAttempts`**, so the retry budget is WorkManager's
default cap. Work is also constrained to `NetworkType.CONNECTED` (`DownloadWorker.kt:281-282`),
so a retry waits for the network rather than burning attempts offline.

Critically: **429 is a 4xx, so PocketPal does *not* retry it** — it falls into
`in 400..499 -> Result.failure()` (`DownloadWorker.kt:145-149`). It never reads `Retry-After`.
Net effect: transient HF throttling during a multi-file pull is a hard failure for PocketPal
too; only 5xx (which HF returns for some CDN edge errors) gets a second life.

**LiAI has no retry anywhere on the download path.** `startDownload`
(`lib/download-service.ts:108-268`) has one `fail()` that throws, and the store catches it into a
failed row (`store/models/downloads.ts:334-340`). "Retry" is the user tapping the card again,
which goes through `startSpecDownload` → `resumeDataForPartial` (`downloads.ts:173`) and
resumes from disk bytes. There is no backoff, no attempt counter, no `Retry-After` read, and
no distinction between a 429 (transient) and a 404 (permanent): both render as
`HTTP 429` / `HTTP 404` (`download-service.ts:233`).

LiAI does have one retry-shaped behaviour worth crediting: the 200-instead-of-206 fallback
(`download-service.ts:219-231`), covered in §6.

---

## 5. Xet / chunked responses and `contentLength === -1`

**Where -1 comes from (Android):**

```kotlin
// expo-file-system/android/.../legacy/FileSystemLegacyModule.kt:961
override fun contentLength(): Long = responseBody?.contentLength() ?: -1
// :977 — passed straight through to the listener
responseBody?.contentLength() ?: -1
```

and the listener adds the resume offset without normalising:

```kotlin
// FileSystemLegacyModule.kt:629-636
override fun update(bytesRead: Long, contentLength: Long, done: Boolean) {
  val totalBytesWritten = bytesRead + (resumeData?.toLong() ?: 0)
  val totalBytesExpectedToWrite = contentLength + (resumeData?.toLong() ?: 0)
```

With a chunked/Xet response `contentLength == -1`, so `totalBytesExpectedToWrite` becomes
`-1 + N` (e.g. `3073` for a 3 KB partial) — a nonsense number.

**LiAI's progress math.** Two independent guards keep this from being user-visible:

```ts
// lib/download-service.ts:146-165
const totalBytes = progress.totalBytesWritten;
const expected = progress.totalBytesExpectedToWrite;
const now = Date.now();
const last = this.lastEmit.get(job.id) ?? 0;
if (now - last < ResumableDownloadService.EMIT_MS && totalBytes !== expected) {
  return;
}
this.lastEmit.set(job.id, now);
const progressPercent =
  job.totalBytes > 0 ? Math.round((totalBytes / job.totalBytes) * 100) : 0;
const updatedJob: DownloadJob = {
  ...
  totalBytes: job.totalBytes || expected,
  ...
};
```

- The **percentage is computed from `job.totalBytes`** (the Hub-API size), not from `expected`
  — so the bar is correct even when `expected` is nonsense. `download-service.ts:158`.
- `expected` is only a *fallback* when the Hub size is unknown (`:164`). With `job.totalBytes > 0`
  the broken value never reaches the UI.
- **One real defect:** the "always let the last tick through" escape at `:153` is
  `totalBytes !== expected`. With `expected == -1 + N`, that condition is *never* true, so the
  final 100 %-adjacent tick can be swallowed for up to `EMIT_MS` (800 ms). Cosmetic only —
  the terminal `completed` job is emitted separately at `:255-263`. It also means the "same guard
  as the Android emitter's `|| totalBytesWritten == totalBytesExpectedToWrite`"
  (`:150`, referring to `FileSystemLegacyModule.kt:641`) is **not** equivalent under chunking.

**Size verification is -1-immune, and that is LiAI's real strength here.**

```ts
// lib/download-service.ts:238-252
if (job.totalBytes > 0) {
  const info = await getInfoAsync(destPath);
  const actual = info.exists && "size" in info ? info.size : -1;
  if (actual !== job.totalBytes) { fail(`Size mismatch (...) — tap Retry to continue`); }
}
```

It stats the file on disk. `contentLength` never enters the decision. A chunked/Xet transfer
still ends up verified. **PocketPal has no equivalent check** — `DownloadWorker` marks
`DownloadStatus.COMPLETED` purely on "the read loop reached EOF" (`DownloadWorker.kt:243-246`),
and the `totalBytes` it computed from `body.contentLength()` (`:168`) can be `-1`, in which case
its progress math divides by a negative/garbage total (`:186`, `:230`) and the JS layer computes
`progress: bytesTotal > 0 ? … : 0` (`DownloadModule.kt:325-328`).

**`ProgressResponseBody.kt` — confirmed a counting no-op.**

```kotlin
// pocketpal-ai/android/.../download/ProgressResponseBody.kt:19-33
private fun source(source: Source): Source {
    return object : ForwardingSource(source) {
        var totalBytesRead = 0L
        override fun read(sink: Buffer, byteCount: Long): Long {
            val bytesRead = super.read(sink, byteCount)
            if (bytesRead != -1L) { totalBytesRead += bytesRead }
            return bytesRead
        }
    }
}
```

`totalBytesRead` is incremented and never read — no listener, no callback. Progress does **not**
flow through this body. It flows through the worker's own byte loop, which counts
`bytesWritten` itself and pushes `setProgress`/`updateProgress` on a time gate
(`DownloadWorker.kt:229-243`, gated by `currentTime - lastProgressUpdate >= progressInterval`
with `DEFAULT_PROGRESS_INTERVAL = 1000L`, `:279`). So progress is real but **1 s granular**,
and the interceptor in `DownloadWorker.kt:311-319` is pure overhead. (Compare expo's version,
which does call `progressListener.update(...)` — `FileSystemLegacyModule.kt:973-981`.)

---

## 6. Resume correctness against HF

**What each side sends.** Both send a bare `Range` with **no validator** — no `If-Range`, no
`ETag` recorded, no sha256 check.

```ts
// LiAI: the resume token IS the byte count
// lib/models/resume-state.ts:11-19
export function resumeDataForPartial(partialBytes, totalBytes) {
  if (!Number.isFinite(partialBytes) || !Number.isFinite(totalBytes)) return null;
  if (partialBytes <= 0 || totalBytes <= 0) return null;
  if (partialBytes >= totalBytes) return null;
  return String(Math.floor(partialBytes));
}
```
→ native adds `Range: bytes=N-` at `FileSystemLegacyModule.kt:661-663`.

```kotlin
// PocketPal, DownloadWorker.kt:82-86
if (file.exists() && file.length() > 0) {
    val range = "bytes=${file.length()}-"
    addHeader("Range", range)
}
```

LiAI *has* the validator material and throws it away: `lfs.oid` (the LFS sha256) is read at
`huggingface.ts:566-568`, stored on the file record (`types/models.ts:23`) and used **only for
bookmarks** (`store/models/catalog.ts:177-180`, `components/models/HFModelSearch.tsx:395-397`).
Grepping `lib/`, `store/`, `components/`, `types/` finds no `If-Range`/`ETag` anywhere.

**200-instead-of-206 fallback.** LiAI:

```ts
// lib/download-service.ts:219-231
if (resumeData && result.status === 200) {
  try { await deleteAsync(destPath, { idempotent: true }); } catch {}
  result = await startTask().downloadAsync();
  if (!result) { reportPaused(); return; }
}
```

**This is correct for HF's CDN.** A cross-host 302 from `resolve` to the CDN forwards the
`Range` header, and both cdn-lfs and the Xet bridge answer 206 when they can. The one case where
HF answers 200 to a ranged request is a cache/edge that ignores `Range` — in which case
discarding the partial and re-issuing without `Range` is exactly right. Doing it *after* the
first full body has already been appended, as expo does (see below), would have been wrong;
LiAI deletes first, so it is fine. The cost is one wasted full transfer; the correctness is
what matters.

PocketPal's equivalent is cheaper and equally correct:

```kotlin
// DownloadWorker.kt:121-126
if (file.exists() && file.length() > 0 && response.code == 200) {
    // Server ignored range request, returning full file. Restarting download from beginning.
    if (file.exists()) { file.delete() }
}
```
It deletes the partial and then keeps streaming the *already-open* response body into the
deleted-then-recreated file (`FileOutputStream(file, appendMode=false)`, `:202-205`). No second
request, no wasted transfer.

**But expo's writer appends *before* anyone looks at the status code.** This is the sharpest
bug in the whole path:

```kotlin
// FileSystemLegacyModule.kt:920-931
val response = call.execute()
val responseBody = response.body
val input = BufferedInputStream(responseBody!!.byteStream())
val output = FileOutputStream(file, isResume)   // isResume == (resumeData != null)
val data = ByteArray(1024)
var count: Int
while (input.read(data).also { count = it } != -1) { output.write(data, 0, count) }
```

There is **no `response.isSuccessful` check**. A 401, 403, 404, **416** or 429 body (HF's JSON
error blob) is written into the destination — and on a resume it is **appended** to the partial
GGUF. LiAI's status check at `download-service.ts:232` fires only *after* the bytes are on disk,
and its 200-fallback at `:219` only cleans up for 200.

Consequences:

- **416 specifically.** HF answers `Range: bytes=N-` with 416 when `N` is past EOF — exactly
  what happens when the repo's file changed (shrunk or replaced) since the partial was written.
  That JSON body is appended; the file grows past its true length; `fail("HTTP 416")` fires; the
  row goes red. Next retry: `onDiskBytes` (`downloads.ts:123-133`) returns the inflated size,
  `resumeDataForPartial` returns `null` because `partialBytes >= totalBytes`
  (`resume-state.ts:17`), so it restarts clean — *self-healing, but only after the user sees a
  failure and a corrupted file exists on disk in between*. PocketPal avoids this entirely by
  checking status **before** touching the file (`DownloadWorker.kt:128-143`).
- **401/403/429 on a resume.** Same append, but the size stays *under* the expected total, so
  the next `Range: bytes=N'-` resumes from a file whose middle contains an HF error blob. The
  concatenated file can land at exactly `job.totalBytes` and pass the size check at
  `download-service.ts:243` — **a GGUF that is silently corrupt**. This is the highest-severity
  corruption path on the LiAI side.

**"HF serves a different file at that path after an update."** Concretely, with no validator:

1. Day 1: `main` has `model.gguf` v1, `lfs.size = S1`. LiAI stores the spec with `size = S1`.
2. User starts, gets 60 % of v1, app is killed.
3. Maintainer pushes v2; `lfs.size = S2`, `S2 > S1`. The user's stored spec still says `S1`
   (it is persisted state, not re-fetched on resume — `downloads.ts:170-173` uses the stored
   `activeFile.size`).
4. Resume: `Range: bytes=<0.6·S1>-` against **v2**. HF honours it (the CDN has no idea which
   version the client was reading). Bytes `0.6·S1 … S2-1` of v2 get appended to the first
   `0.6·S1` bytes of v1.
5. If `S2 > S1`, `resumeDataForPartial(0.6·S1, S1)` was computed against `S1` and returned a
   valid token, so the transfer proceeds. The final file length is
   `0.6·S1 + (S2 - 0.6·S1) = S2` — but `job.totalBytes` is still `S1`, so the size check at
   `download-service.ts:243` fires `Size mismatch (S2 of S1 bytes)`. Caught.
6. If instead the spec *was* refreshed to `S2` before the resume (a fresh search/detail fetch
   repopulating the row), and v2's first `0.6·S1` bytes happen to be identical to v1's prefix
   (very likely — GGUF headers and the first tensors rarely change), then
   `actual === job.totalBytes` and **the check passes on a spliced file.** Silent corruption.

Neither side has any defence: PocketPal has no size check at all (§5) and the same blind
`Range`. The correct primitive is already in LiAI's hands — `file.oid` is the LFS sha256 of the
exact bytes. A `If-Range: <oid>` (or a post-download `oid` comparison against the Hub's
`lfs.oid`) makes step 4 impossible: the CDN answers 200 instead of 206, and both sides already
have the delete-and-restart path for exactly that.

**Pause/resume mid-session.** LiAI uses expo's `pauseAsync`/`resumeAsync`
(`download-service.ts:277-300`, `:307-386`). On Android, `pauseAsync` returns the file length as
`resumeData` (`FileSystemLegacyModule.kt:669-679`) and `resumeAsync` re-sends `Range`. On iOS it
returns base64 `resumeData` and `downloadTask(withResumeData:)` is used
(`FileSystemLegacyModule.swift:277-278`, `:299-307`) — Foundation's own resume data, which
encodes the validator internally. **So iOS is actually better protected against a mid-session
resume than Android**, because Apple's resume data carries an ETag; Android's `Range: bytes=N-`
carries nothing. Note `resumeDownload` in `download-service.ts:350-362` accepts 200 or 206 and
reports complete — a 200 there is a server-ignored-Range that was appended onto a partial.

---

## 7. Multi-file and mirror selection

Neither side pins to a mirror; both always go through `huggingface.co/resolve` and let the 302
pick the CDN node. No `HF_ENDPOINT`, no mirror table, no `?download=true`, no retry across
mirrors on either side.

**Sequencing differs:**

- **LiAI: strictly serial.** The projector leg starts only after the main leg's success
  callback fires:

```ts
// store/models/downloads.ts:255-267
if (success && specNow?.projector !== undefined &&
    downloadJob.fileName === specNow?.files[0]?.name) {
  void get().startSpecDownload(specNow, specNow.files[0], ...);
  return;
}
```
  with the leg chosen up-front by `pairDownloadStep` (`downloads.ts:137-145`). One socket, one
  file at a time. Safe from HF rate limits; slow (a 4 GB GGUF blocks the 800 MB mmproj).

- **PocketPal: concurrent on Android, serial on iOS.** `checkSpaceAndDownload` awaits
  `downloadManager.startDownload` and then starts the projector
  (`src/store/ModelStore.ts:1605-1627` → `_downloadProjectionModelIfNeeded`, `:1527-1569`).
  But Android's `startAndroidDownload` resolves as soon as WorkManager enqueues
  (`DownloadManager.ts:487-506`), so the mmproj worker starts while the GGUF is still
  transferring — two parallel multi-GB pulls against the same CDN. On iOS `startIOSDownload`
  awaits `downloadResult.promise` (`DownloadManager.ts:415`), so iOS is serial.

Neither side aggregates. Neither checks free space for the *pair* as a whole at download time —
LiAI's free-space check is per-leg (`downloads.ts:211-217`), PocketPal's is via `hasEnoughSpace`
per model (`DownloadManager.ts:250-257`). The pair total only appears in the pre-download
warning chip (`lib/models/hf-warnings.ts:47-50`).

---

## 8. `.part` file discipline

**Neither side uses a temp name.** Both write straight to the final `.gguf`.

- LiAI: `destPath = getModelsDirectoryPath() + job.fileName` (`download-service.ts:139`) is
  handed to `createDownloadResumable` as the destination (`:178-183`); the native layer opens it
  with `FileOutputStream(file, isResume)` (`FileSystemLegacyModule.kt:926`). No rename anywhere.
  iOS: `URLSessionDownloadTask` writes to the same path via
  `EXSessionResumableDownloadTaskDelegate`'s `localUrl` (`FileSystemLegacyModule.swift:261-296`).
- PocketPal: `FileOutputStream(file, appendMode)` (`DownloadWorker.kt:205`) and
  `toFile: destinationPath` (`DownloadManager.ts:334`).

**Corruption exposure if the app is killed mid-write.** The bytes on disk are a valid *prefix* of
the remote file, which is exactly what `Range` resume needs — so the no-`.part` choice costs
little in the common case. It is fatal in exactly one case: **anything that reads `models/` while
a partial `.gguf` is sitting there.**

LiAI's reconciliation:

```ts
// store/models/downloads.ts:418-438
const info = await LegacyFileSystem.getInfoAsync(dir + file.name);
if (info.size >= file.size) {
  get().updateModel(spec.id, { downloadStatus: "completed", ... localPath: dir + file.name });
} else if (resumeDataForPartial(info.size, file.size) !== null) {
  get().updateModel(spec.id, { downloadStatus: "paused", ... });
}
```

**Is size alone sufficient?** No, and there are two concrete ways it fails:

1. **Size drift.** The expected size comes from the Hub tree API at browse time
   (`huggingface.ts:566`) and is persisted. If the repo updated between browse and reconcile,
   `info.size >= file.size` compares a v1 file against a v2 expectation. In the dangerous
   direction (stale size *larger* than the file at rest) the partial is demoted to `paused` and
   later resumed with `Range` — the splice of §6.6. In the other direction (file at rest is
   bigger than the stale expectation, e.g. after §5's appended error blob pushed it over), the
   row is marked **`completed` on a file that is not a valid GGUF.** Note the `>=` rather than
   `===` at `:421` — it deliberately tolerates overshoot, which is what makes the overshoot
   case silently "complete".
2. **Right size, wrong bytes.** A GGUF whose length matches but whose middle contains an
   appended 429 blob (§5/§6) passes both this check and the in-flight check at
   `download-service.ts:243`. Size is a necessary condition, never sufficient.

The `oid` (sha256) already on every file record (`types/models.ts:23`) would make both exact.
PocketPal is worse here: its reconciliation only syncs the DB to the file length
(`DownloadWorker.kt:64-76`) and never even asks whether the file is whole; completeness is
"WorkManager said SUCCEEDED".

A `.part` + rename is three lines and removes exposure #1 entirely — the app simply never has a
file named `model.gguf` that is not a model. It does **not** remove the resume-splice risk (§6),
which is a validator problem, not a naming problem.

---

## Diff: LiAI vs PocketPal on the HF path

Ordered by likelihood of a user-visible bug.

| # | Behaviour | LiAI | PocketPal | Symptom if wrong |
|---|---|---|---|---|
| 1 | **Non-2xx body written into the destination** | no status check before writing; appends on resume (`FileSystemLegacyModule.kt:920-931` + `download-service.ts:232`) | checks status before writing (`DownloadWorker.kt:128-155`) | **corrupted GGUF that passes the size check**; failed download on 429/416 |
| 2 | **No `Range` validator** | `Range: bytes=N-`, no `If-Range`; `oid` captured but unused for this | same (`DownloadWorker.kt:82-86`) | silent splice when the repo file changed mid-resume |
| 3 | **No retry / no backoff / no `Retry-After`** | none; `HTTP 429` shown raw (`download-service.ts:232-234`) | exponential backoff + `Result.retry()` for 5xx only; **429 hits the 4xx failure branch** (`DownloadWorker.kt:145-155`, `:285-288`) | failed download on transient throttling (both); LiAI also loses the whole transfer |
| 4 | **Reconcile/complete by size alone, with `>=`** | `info.size >= file.size → completed` (`downloads.ts:421`) | no completeness check at all; trusts EOF (`DownloadWorker.kt:243-246`) | corrupt GGUF reported as `completed` |
| 5 | **No post-download size check on the resume path** | present on `startDownload` (`:238-252`), **absent on `resumeDownload`** (`:350-362`) | absent | oversize splice marked complete |
| 6 | **Last progress tick can be dropped under chunked encoding** | `totalBytes !== expected` guard with `expected == -1 + N` (`:153` vs `FileSystemLegacyModule.kt:633`) | n/a — counts its own bytes (`DownloadWorker.kt:229-243`) | bar sticks ~800 ms below 100 % (cosmetic) |
| 7 | **Multi-file ordering** | serial (`downloads.ts:255-267`) | concurrent on Android, serial on iOS (`ModelStore.ts:1605-1627`, `DownloadManager.ts:487-506`) | PocketPal-only: two multi-GB pulls at once, more 429 exposure |
| 8 | **Token host predicate** | `.endsWith("huggingface.co")`, no scheme check (`huggingface.ts:582-588`) | exact host + https (`DownloadManager.ts:37-46`) | latent; no reachable non-HF URL today |
| 9 | **401 vs 403** | both → `authentication` (`huggingface.ts:465-467`) | 401 → auth, 403 → authorization (`errors.ts:88-100`) | misleading message on a gated repo |
| 10 | **Auth header on cross-host redirect** | OkHttp 4.9.2 default → stripped (verified) | OkHttp 4.12.0 default → stripped (verified) | none on Android; iOS unverified (see §2) |
| 11 | **Progress granularity** | 800 ms JS gate (`:77`, `:153`) | 1000 ms Kotlin gate (`DownloadWorker.kt:279`, `:235`); `ProgressResponseBody.kt:24-31` counts and discards | none |
| 12 | **Percent basis** | Hub-API size (`download-service.ts:158`) — correct under `-1` | `body.contentLength()` (can be `-1`, `DownloadWorker.kt:168`, `:186`) — wrong under Xet | PocketPal-only: NaN/negative progress |
| 13 | **200-vs-206 fallback** | correct, wastes one full transfer (`:219-231`) | correct, reuses the open response (`DownloadWorker.kt:121-126`) | none |
| 14 | **416 handling** | unhandled; error body appended (§6) | explicit fail + partial delete (`DownloadWorker.kt:129-143`) | LiAI-only: corrupted-then-recovered file |
| 15 | **Nested-path (subfolder) GGUFs** | no percent-encoding (`huggingface.ts:578`) | no percent-encoding (`urls.ts:18`) | 404 on quants in subfolders (both) |
| 16 | **`User-Agent`** | `LiAI/1.0.0` (`huggingface.ts:36`) | `PocketPal/<v> (ai.pocketpal)` | none |

**The headline:** LiAI is *better* on progress-under-chunked-encoding (#6, #12) and on
post-download verification — its size check is the only end-to-end integrity gate either codebase
has. It is *worse* on the write path (#1), on 416 (#14), on retries (#3), and on reconcile
strictness (#4, #5). Items #1, #2, #4 and #5 all funnel into the same outcome: **a GGUF that
loads to "wrong weights" or a load failure with no explanation.**

---

## What to change in LiAI

Ranked. Items 1–3 are the ones I would actually do; the rest are marked for what they cost.

### 1. Don't let a non-2xx body reach the destination file — HIGH
**File:** `node_modules/expo-file-system/.../legacy/FileSystemLegacyModule.kt` is vendored and not
editable in practice, so do it from **JS** in `lib/download-service.ts`.

The expo legacy API gives no pre-flight hook, so the practical fix is to make the *resume* path
safe rather than to patch the native layer:
- In `startDownload`, before `startTask(resumeData).downloadAsync()` (`:212`), and in
  `resumeDownload` before `entry.task.resumeAsync()` (`:365`), treat a resume as untrusted: the
  destination must be truncated (not appended to) unless we can confirm the server honoured
  `Range`. Cheapest correct version: on any non-200/206 outcome **delete the partial** before
  `fail()`, not just on 200 (`:219-231`).
- Add a `416` branch alongside it, mirroring `DownloadWorker.kt:129-143`: delete the partial and
  fail with "the file on the server has changed — start again".

**Risk if skipped:** a 401/403/429 mid-resume leaves an HF JSON blob inside the `.gguf`. If it
also happens to produce the expected length, the file is marked `completed`
(`downloads.ts:421`) and the user gets a model that silently misbehaves. This is the worst
failure mode in the whole path.

### 2. Use the `oid` you already have as a resume validator — HIGH
**File:** `store/models/downloads.ts` (job construction, `:186-197`) + `lib/models/resume-state.ts`.

`file.oid` is the LFS sha256 (`huggingface.ts:566-568`, `types/models.ts:23`). Two options, both
cheap:
- Send `If-Range: <oid>` as a request header. `FileSystemLegacyModule.kt:667-670` copies every
  entry of `options.headers` onto the request, so it needs no native change. On a changed file the
  CDN answers **200 instead of 206**, and the existing `resumeData && result.status === 200`
  branch (`:219-231`) already handles that correctly by discarding the partial.
- Or, after the existing size check (`:238-252`), compare `await readGgufMetadata`/a cheap hash
  against `oid` when it is present, and fail on mismatch.

`If-Range` is strictly better: it prevents the splice rather than detecting it after the fact.
One header, no new state, no I/O.

**Risk if skipped:** a resume across a repo update produces a file of exactly the right length
whose middle is from two different model versions — undetectable by any check currently in the
codebase.

### 3. Surface 401/403/429 as something actionable, and retry transient ones — MEDIUM-HIGH
**File:** `lib/download-service.ts:232-234` + `store/models/downloads.ts` (the failure branch,
`:326-334`).

Currently every non-2xx collapses to `HTTP ${status}`. Three cases deserve distinct handling:
- **401/403** → the same `HfError("check your Hugging Face token", "authentication")` code the
  search path already produces (`huggingface.ts:465-467`), so the existing
  "Disable Token & Retry" affordance (`catalog.ts:161-167`) fires on the card too. For a gated
  repo, a 403 means *access not granted*, not *bad token* — keep it distinct from 401 as
  PocketPal does (`errors.ts:88-100`).
- **429** → read `Retry-After` (expo returns response headers in the result bundle,
  `FileSystemLegacyModule.kt:936`) and retry **once** with backoff. This is the one retry that
  clearly pays for itself: HF throttles exactly the multi-file pull pattern LiAI uses.
- **5xx** → retry once, same mechanism.

**Risk if skipped:** a throttled multi-GB transfer dies at 90 % and the user has to notice and
tap Retry themselves.

### 4. Tighten reconcile to `===` and validate — MEDIUM (partly covered by #2)
**File:** `store/models/downloads.ts:421`.

`info.size >= file.size → completed` tolerates overshoot, which is precisely the state left by
the append-an-error-body bug. Change to `===` once #1 is in (with the exception being a file that
is legitimately larger because the repo updated — which #2's `If-Range` already prevents from
being resumed at all). Skip the `oid` comparison if you did #2; `If-Range` covers the splice,
but not the "stale completed file from an older app version" case.

**Risk if skipped:** an oversized corrupt file is reported as `completed` and the user is never
offered a retry.

### 5. Percent-encode nested GGUF paths — LOW
**File:** `lib/models/huggingface.ts:577-579`.

`getModelFiles` already requests `recursive=true` (`:557`), so `f.path` can be
`Q4_K_M/model.gguf`. Encode each segment: `path.split("/").map(encodeURIComponent).join("/")`.
Three lines. (PocketPal has the same gap — do not treat it as parity you must copy.)

**Risk if skipped:** 404 on repos that version quants in subfolders. Low frequency.

### 6. Exact-host token predicate — LOW / defensive
**File:** `lib/models/huggingface.ts:582-588`.

Replace `.endsWith("huggingface.co")` with PocketPal's `protocol === 'https:' && host === 'huggingface.co'`
(`DownloadManager.ts:37-46`). Two conditions, no behaviour change for today's URLs, closes the
`evil-huggingface.co` / plain-`http` shapes. Also the natural place to record the iOS redirect
answer if it ever gets verified — if Foundation turns out to *not* strip, the fix belongs in
expo's `URLSession` delegate, not here, so this only hardens the first hop.

### Explicitly speculative — do not build without a reproduction
- **iOS redirect/Authorization behaviour (§2).** Unverifiable from this workspace. If Foundation
  *does* forward the header cross-origin, this is a token leak to `cdn-lfs.hf.co` (still an HF
  domain, but not `huggingface.co`, and it would be a real credential exposure on a compromised
  or hostile CDN). Worth a five-minute device test with a proxy before writing any code.
- **Xet-specific handling.** `-1` `Content-Length` is handled correctly for progress and
  verification by accident of design (#6, #12 in the table). There is no observed user-visible
  bug from it today. Fix #3's throttle escape (`totalBytes !== expected` → also fire when
  `expected < 0`) only if you ever see a bar visibly stuck.
- **Concurrent projector download.** Serial is safer against 429 and matches iOS. Only worth
  changing if the serial wait measurably annoys users on large pairs.
- **Mirror pinning.** There is no evidence in either codebase that CDN node selection is a problem.
  Skip.

---

### Not present in the vendored copy
- Any HF revision/commit pinning — absent on both sides (`resolve/main` literal everywhere).
- Any `?download=true` usage — absent on both sides.
- Any HEAD/Range preflight request — absent on both sides.
- Any `Retry-After` read, or any HTTP 429-specific handling — absent on both sides.
- Any `.part`/`.tmp` temp file, or any rename-on-complete — absent on both sides.
- Any `ETag`/`If-Range`/`If-None-Match` capture or send — absent on both sides.
- Any `followRedirects` / redirect-interceptor configuration on either Android client —
  `DownloadWorker.kt:23-25` and `FileSystemLegacyModule.kt:992-1000` are both bare builders.