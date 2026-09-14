# VisionCamera + Expo SDK 57 integration (mechanism only)

Target: snapshot-from-preview (`takeSnapshot`) → base64 over existing WebSocket. No frame processors, no Skia.

## 1. Install set (SDK 57 / RN 0.86 / React 19)

- Pin **`react-native-vision-camera@4.7.3`** (last v4; v5 needs Nitro modules + new peers, avoid). v4.7.3 peers: `react-native-reanimated`, `react-native-worklets-core`, `@shopify/react-native-skia` (all `*`, npm `package/package.json` @v4.7.3). ([npm](https://registry.npmjs.org/react-native-vision-camera), [package.json](https://github.com/margelo/react-native-vision-camera/blob/v4.7.3/package/package.json))
- **Snapshot-only needs none of those three.** Frame Processors are what pull in `react-native-worklets-core` ≥1.0 + `react-native-worklets-core/plugin` in `babel.config.js` ([FRAME_PROCESSORS.mdx](https://github.com/margelo/react-native-vision-camera/blob/v4.7.3/docs/docs/guides/FRAME_PROCESSORS.mdx)). Without worklets-core installed, Frame Processors are "automatically disabled anyways" ([@types.ts](https://github.com/margelo/react-native-vision-camera/blob/v4.7.3/package/src/expo-plugin/@types.ts)). So: `npx expo install react-native-vision-camera@4.7.3`, skip Skia/worklets entirely, set `enableFrameProcessors: false` in plugin props.
- ⚠️ **Reanimated conflict:** v4.7.3 changelog "Pin Reanimated to 3.9.0" ([release](https://github.com/margelo/react-native-vision-camera/releases)); this project has `react-native-reanimated@4.5.1` + `react-native-worklets@0.10.1` (successor pkg, not `worklets-core`). Snapshot path doesn't call Reanimated, but native autolinking still builds VC++ against whatever is present — verify with a build; downgrading Reanimated to satisfy VC would break other screens.
- No `expo-build-properties` needed: VC requires Android SDK ≥21 / iOS ≥12 ([GETTING_STARTED.mdx](https://github.com/margelo/react-native-vision-camera/blob/v4.7.3/docs/docs/guides/GETTING_STARTED.mdx), `minSdkVersion safeExtGet(...,21)` in [build.gradle](https://github.com/margelo/react-native-vision-camera/blob/v4.7.3/package/android/build.gradle)); Expo defaults already exceed this.

## 2. Config plugin

`app.json` plugins entry (from [GETTING_STARTED.mdx](https://github.com/margelo/react-native-vision-camera/blob/v4.7.3/docs/docs/guides/GETTING_STARTED.mdx), plus `enableFrameProcessors` from [@types.ts](https://github.com/margelo/react-native-vision-camera/blob/v4.7.3/package/src/expo-plugin/@types.ts)):

```json
["react-native-vision-camera",
  { "cameraPermissionText": "$(PRODUCT_NAME) needs access to your Camera.",
    "enableMicrophonePermission": false,
    "enableFrameProcessors": false }]
```

Works because the package ships `app.plugin.js` → `withVisionCamera` (`createRunOncePlugin`), which injects `NSCameraUsageDescription` / `android.permission.CAMERA` ([withVisionCamera.ts](https://github.com/margelo/react-native-vision-camera/blob/v4.7.3/package/src/expo-plugin/withVisionCamera.ts)). Request at runtime via `useCameraPermission()` / `Camera.requestCameraPermission()`. Expo Go can't load it (custom native code) — dev-client required.

## 3. Dev-client build routes ([Expo intro](https://docs.expo.dev/develop/development-builds/introduction.md))

- **EAS cloud:** `npx expo install expo-dev-client`; `npm i -g eas-cli && eas login` (Expo account required); `development` profile in `eas.json`; `eas build --platform android --profile development`. No local toolchain needed.
- **Local:** `npx expo install expo-dev-client`, then `npx expo prebuild` (generates `android/`) + `npx expo run:android [--device]`. Needs Android Studio / SDK + JDK locally. Re-run `prebuild --clean` + rebuild only when native deps/config/SDK change.

## 4. `takeSnapshot` (v4 API)

Exists: `takeSnapshot(options?: TakeSnapshotOptions): Promise<PhotoFile>` ([Camera.tsx](https://github.com/margelo/react-native-vision-camera/blob/v4.7.3/package/src/Camera.tsx)). Options: `{ quality?: number /*jpeg, default 100*/, path?: string /*existing dir, else tmp */ }` ([Snapshot.ts](https://github.com/margelo/react-native-vision-camera/blob/v4.7.3/package/src/types/Snapshot.ts)). Returns file **path**, not base64 — read via `expo-file-system` (`readAsStringAsync(path, { encoding: 'base64' })`) then WS-send; throttle interval client-side (e.g. 1–2 s). Caveats: Android = GPU preview screenshot; **iOS waits for a video-pipeline frame, requires `video={true}`** on `<Camera>` (Camera.tsx docstring). Min Android API 21 (build.gradle).

## 5. SDK 57 incompatibilities

- [#4020](https://github.com/margelo/react-native-vision-camera/issues/4020) (open, Jun 2026) "chore: Upgrade to react-native 0.86" — no official RN 0.86 support claim for v4; expect risk, build to confirm.
- [#3396](https://github.com/margelo/react-native-vision-camera/issues/3396) (closed): v4.6.x broke on RN 0.77 Gradle-plugin upgrade — precedent that RN bumps break VC Android builds.
- [#3538](https://github.com/margelo/react-native-vision-camera/issues/3538), [#2286](https://github.com/margelo/react-native-vision-camera/issues/2286), [#3084](https://github.com/margelo/react-native-vision-camera/issues/3084) (closed): `react-native-worklets[-core]` linking/build failures — sidestepped by `enableFrameProcessors: false` + not installing worklets-core.

Recommendation: spike `takeSnapshot` on one Android dev-client before committing (Reanimated 4.x vs pinned 3.9.0 is the top risk).
