# PocketPal AI — camera/vision pipeline (primary-source only)

Scope: `a-ghorbani/pocketpal-ai` v1.17.3 clone, `src/` + `package.json`. Relevance to LiAI: still-capture vs streaming, event-loop blocking, Expo tradeoffs.

## 1. Camera → model path: still photo on a timer, not frame processor

- Live “video” pal is a VisionCamera `<Camera photo={true} isActive={true}>` with periodic `takePhoto()` — no `useFrameProcessor`/Skia buffer path anywhere in `src/` (`src/components/EmbeddedVideoView/EmbeddedVideoView.tsx:168-176,88-130`; `package.json:87` pins `react-native-vision-camera ^4.7.2`).
- Capture loop is `setInterval(captureInterval)` + `isCapturing` guard so a slow `takePhoto()` can’t overlap the next tick (`EmbeddedVideoView.tsx:88-130`). Default interval 1000 ms, user-adjustable 500–5000 ms in 500 ms steps (`src/screens/ChatScreen/VideoPalScreen.tsx:32`; `EmbeddedVideoView.tsx:138-146`).
- Silent capture: `takePhoto({flash:'off', enableShutterSound:false})` (`EmbeddedVideoView.tsx:97-100`). Still-photo shutter interruption is therefore accepted, not avoided.
- Single-shot chat path is separate: `launchCamera({mediaType:'photo', quality:0.8})` from `react-native-image-picker`, permission only via VisionCamera’s `useCameraPermission` (`src/components/ChatInput/ChatInput.tsx:145,259-290`; `package.json:71`).
- Preprocessing: none. Photo file → `RNFS.readFile(path,'base64')` → `unlink(path)` → `data:image/jpeg;base64,…` string passed as `image_path` (`EmbeddedVideoView.tsx:103-121`). No resize/downscale/EXIF step in this path.

## 2. Inference: fully on-device via llama.rn + mmproj

- No server/WebSocket inference. Model loads with `initLlama({model: filePath, ...effectiveSettings})` (`src/store/ModelStore.ts:2255-2270`); vision enabled by `ctx.initMultimodal({path: mmProjPath, use_gpu, image_max_tokens: min(config, n_ctx)})` then verified with `isMultimodalEnabled()` (`ModelStore.ts:2290-2320`).
- mmproj pairing is filename-driven: `MMProjRegex = /mmproj.+\.gguf$/i` (`src/utils/multimodalPatterns.ts:4`); helpers pick recommended projector by quant match (`src/utils/multimodalHelpers.ts:46-90`).
- Feeding: `startImageCompletion({prompt, image_path|image_paths})` builds OpenAI-style `messages=[system?, {role:'user', content:[{type:'text'},{type:'image_url', image_url:{url}}]}]` and calls `context.completion(params, onToken)` (`ModelStore.ts:3734-3830`). `file://` prefix stripped on iOS only.
- Concurrency: JS flags `inferencing`/`isStreaming` gate UI; loads serialized by `contextOperationMutex` with last-one-wins `pendingModelId` (`ModelStore.ts:2225-2260,3359-3365`). Threads default to `getRecommendedThreadCount()` on first launch (`ModelStore.ts:337-348`). CPU/GPU work happens in llama.rn native (llama.cpp), not the JS event loop — no worker threads in JS.

## 3. Keeping preview live: throttle + backpressure, not backgrounding

- Throttle: `VideoPalScreen.handleImageCapture` drops frames with `Date.now()-lastAnalysisTime < captureInterval → return` (`VideoPalScreen.tsx:197-205`), clears `responseText` per analysis, streams tokens via `onToken` into an overlay bubble.
- Backpressure is coarse: interval timer keeps firing during inference (no queue), but a new completion is only started per throttle window; stopping calls `context.stopCompletion()` before closing camera (`VideoPalScreen.tsx:128-143`).
- Model auto-release (Android memory saver) is explicitly disabled during `launchCamera`/`launchImageLibrary` (`ChatInput.tsx:270,288,306,326` via `disableAutoRelease/enableAutoRelease`, `ModelStore.ts:1076-1093`) — transferable fix for LiAI’s “model unloaded while camera open” class of bug.

## 4. Voice / realtime companion

- No realtime duplex voice+vision. Voice is post-hoc TTS over completed/streamed text: `createEngineStreamingHandle` wraps `Speech.createSpeechStream(voiceId,{targetChars:300})` with `appendText/finalize/cancel`, engine pinned via `ttsRuntime.acquire` (`src/services/tts/streamingHandle.ts:32-110`). Engines: Kitten/Kokoro/Supertonic (ONNX, `onnxruntime-react-native`, `package.json:61`) + system TTS (`src/store/TTSStore.ts:1-25`).
- `VoiceChip` self-gates (`return null` when TTS unavailable) and toggles auto-speak/stop independently of text streaming (`src/components/VoiceChip/VoiceChip.tsx:64-72`). STT/voice-input: none found in this pipeline (mic path is TTS output only).
- Build note for LiAI’s Expo question: PocketPal is bare React Native CLI (`react-native 0.82.1`, custom native `llama.rn`/`vision-camera`), not Expo Go — native modules it depends on require a dev-client/ejected build (`package.json`, `App.tsx`, `android/`, `ios/`).

## Transfer to LiAI

- Cheapest anti-shutter option PocketPal does *not* use: preview-buffer snapshot / frame processor instead of `takePhoto`. If LiAI keeps still-capture, copy its mitigations: `enableShutterSound:false`, `isCapturing` re-entrancy guard, throttle window, temp-file `unlink`.
- Copy `disableAutoRelease`-style load pinning around camera intent; gate analysis on `visionActive` before opening the camera.
