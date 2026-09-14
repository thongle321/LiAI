# PocketPal capture fix — ranked differences (verdict first)

**Sources:** `react-native-vision-camera@4.7.3` installed package source in `D:\aivision\frontend\node_modules\react-native-vision-camera` (primary — `src/Camera.tsx`, `android/.../CameraView+TakeSnapshot.kt`, `CameraViewModule.kt`, `core/CameraError.kt`, `src/types/CameraProps.ts`); our code `frontend/app/vision.tsx`, `frontend/app.json`; PocketPal facts carried from the prior primary-source clone note `.scratch/pocketpal-camera-pipeline.md` (pocketpal-ai v1.17.3, `EmbeddedVideoView.tsx`, `VideoPalScreen.tsx`, `ChatInput.tsx`) — could not re-clone here (no network/shell in this environment), and every API claim below was re-verified against the installed VisionCamera source.

## Verdict: the single most likely reason `takeSnapshot` silently produces nothing

**On Android, `takeSnapshot` is a GPU screenshot of the preview view, and it throws whenever the preview isn't actually rendering — and our `.catch(() => undefined)` deletes the evidence.** Native code (`CameraView+TakeSnapshot.kt:14-17`):

```kotlin
val previewView = previewView ?: throw SnapshotFailedPreviewNotEnabledError()
val bitmap = previewView.bitmap ?: throw SnapshotFailedError()  // "Try using takePhoto() instead."
```

So: permission granted + black/unready preview (camera session not initialized yet, view not laid out, or native mismatch) ⇒ every 1 s tick throws `capture/snapshot-failed` ⇒ swallowed ⇒ zero frames, zero logs. Compounding it, `if (ws.readyState !== WebSocket.OPEN) return` means when the backend is down (which it was), **capture isn't even attempted** — also silently. Three silent layers, zero observability. That is the bug more than any single API misuse. PocketPal never hits this because it uses `takePhoto` (real still pipeline, not a preview screenshot) with logged errors.

## Ranked differences → concrete changes

### 1. Swallowed capture errors → log + surface them (`frontend/app/vision.tsx`)
- **Theirs:** `try/catch` around `takePhoto` + `RNFS.readFile/unlink` with error logging (`EmbeddedVideoView.tsx:88-130`).
- **Ours:** `.catch(() => undefined)`; file-read/delete errors inside `.then` swallowed too.
- **Change:** replace with `.catch((e) => { console.error("[vision] snapshot failed", e?.code ?? e?.message ?? e); setProblem(...) })`. This one change turns every other hypothesis below into a 10-second diagnosis.

### 2. No camera-ready gate → add `onInitialized`/`onError` (`frontend/app/vision.tsx`)
- **Theirs:** capture loop runs only while the video-pal session is active; camera open and interval start together.
- **Ours:** interval starts on mount; ticks fire before the native session/preview exists (guaranteed early `snapshot-failed`s) and we wire neither `onInitialized` nor `onError` (both exist: `CameraProps.ts:328,336`).
- **Change:** add `ready` ref via `onInitialized={() => ...}`, skip ticks until ready; wire `onError={(e) => setProblem(e.message)}`.

### 3. Capture gated on WS state → attempt/log independently (`frontend/app/vision.tsx`)
- **Theirs:** on-device inference; capture never depends on a socket.
- **Ours:** `ws.readyState !== OPEN → return` before touching the camera, so "servers not running" presents as "camera produces nothing."
- **Change:** keep the send-gate, but log a skip (`console.log("[vision] ws not open, skipping capture")`) or capture-then-drop so camera health is observable without a backend.

### 4. `takeSnapshot` → `takePhoto` (`frontend/app/vision.tsx`)
- **Theirs:** `takePhoto({ flash: 'off', enableShutterSound: false })` with `<Camera photo={true} isActive={true}>` (`EmbeddedVideoView.tsx:97-100,168-176`); accepts shutter flicker.
- **Ours:** `takeSnapshot({ quality: 50 })` — preview-size GPU screenshot, fragile per Verdict; the native error message itself says "Try using takePhoto() instead" (`CameraError.kt:128-129`).
- **Change:** `ref.takePhoto({ flash: 'off', enableShutterSound: false })`. `photo` prop already set — no other prop change needed. Cost: shutter interruption; that is the trade PocketPal accepted.

### 5. No foreground/lifecycle handling → gate `isActive` (`frontend/app/vision.tsx`)
- **Theirs:** stops completion and closes camera on stop (`VideoPalScreen.tsx:128-143`).
- **Ours:** bare `isActive` (always true); backgrounding holds the camera.
- **Change:** `const focused = useIsFocused()` (or `useAppState`) → `isActive={focused}`. Low rank — correctness/hygiene, not the silence cause.

### 6. `app.json` / manifest — NO CHANGE NEEDED (verified)
Plugin entry with `cameraPermissionText` + `enableFrameProcessors: false`, `android.permission.CAMERA`, `NSCameraUsageDescription` all present and match VisionCamera's documented requirements. No microphone permission needed (no audio). Parity with PocketPal (bare RN, same native module).

### 7. Format / pixelFormat / resize / quality — NO CHANGE NEEDED (parity)
PocketPal does no format selection, no downscale, no EXIF step in the capture path (full-res `takePhoto` → base64 → unlink). Our `quality: 50` is valid (`TakeSnapshotOptions.kt:12`, `getInt("quality")`, default 100) and our `readAsStringAsync` + `deleteAsync(idempotent)` mirrors their `readFile` + `unlink`. Keep.

## Start Here
Apply #1 first (one-line change, converts silence into an error code), then read the code from the log: `snapshot-failed` ⇒ #4; `snapshot-failed-preview-not-enabled` ⇒ preview/layout issue; no attempts at all ⇒ #3. PocketPal parity is #4 + #2.

### Files Retrieved
1. `frontend/app/vision.tsx` (lines 1-140) — our capture screen: interval + takeSnapshot + swallowed catch
2. `frontend/app.json` (full) — plugin/permissions config, verified OK
3. `frontend/lib/vision.ts` (full) — WS protocol helpers, no capture logic
4. `frontend/node_modules/react-native-vision-camera/src/Camera.tsx` (lines 60-170) — `takeSnapshot`/`takePhoto` docstrings + API
5. `frontend/node_modules/react-native-vision-camera/android/.../react/CameraView+TakeSnapshot.kt` (full) — null-bitmap throw, the verdict's mechanism
6. `frontend/node_modules/react-native-vision-camera/android/.../react/CameraViewModule.kt` (lines 80-120) — takeSnapshot dispatch + promise reject path
7. `frontend/node_modules/react-native-vision-camera/android/.../core/CameraError.kt` (lines 115-140) — exact error codes/messages
8. `frontend/node_modules/react-native-vision-camera/src/types/CameraProps.ts` (lines 55-75, 300-380) — `isActive`, `preview`, `onError`, `onInitialized`
9. `.scratch/pocketpal-camera-pipeline.md` (full) — prior clone note reused for PocketPal file:line facts
10. `.scratch/vision-camera-expo-integration.md` (full) — install/config context, SDK 57 caveats
