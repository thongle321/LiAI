# PocketPal's vision feature vs LiAI's — how it works, what to port

Date: 2026-10-06
Method: read every claim from primary sources — PocketPal's reference tree
(`pocketpal-ai/`, read-only checkout) and LiAI's shipped code at the repo root.
Each claim carries `path:line`. UNVERIFIED marks anything that could not be
confirmed from source.

## Scope constraint (user decision, fixed)

PocketPal gates vision through its **Pal (profile) system**: a profile carries
`capabilities.video`, the model to load, the capture interval, the system
prompt. **LiAI's future "pals" will be chat-only; LiAI vision must activate on
model capability alone — no profile selection step.** Everything profile-coupled
below is context, explicitly not a port target (§5b).

---

## 1. PocketPal's vision feature, end to end

PocketPal has **two** vision surfaces plus a pairing/download UX.

### 1a. Composer image attach (chat)

- Entry: ChatInput's plus menu — `launchCamera` / `launchImageLibrary` from
  `react-native-image-picker` (`pocketpal-ai/src/components/ChatInput/ChatInput.tsx:12,278,524`;
  menu labels `locales/en.json:1189`).
- The attach button is **always rendered**; only its *enabled state* flips with
  capability: ChatScreen passes `showImageUpload={true}` and
  `isVisionEnabled={visionEnabled}` (`pocketpal-ai/src/screens/ChatScreen/ChatScreen.tsx:270-271`),
  and the plus button is enabled only when `isVisionEnabled`
  (`ChatInput.tsx:376`: `const isPlusButtonEnabled = !isStreaming && isVisionEnabled`).
- On send, `useChatSession` reads `isMultimodalEnabled = modelStore.activeModelCaps.visionActive`
  (`pocketpal-ai/src/hooks/useChatSession.ts:538`). If images and enabled: the
  user content becomes an OpenAI array
  `[{type:'text',text},…{type:'image_url',image_url:{url}}]`
  (`useChatSession.ts:87-97`); otherwise a plain string **plus** a warning:
  `setChatWarning(createMultimodalWarning(…))` (`:101-105`).

### 1b. Live video loop — `VideoPalScreen` (the profile-coupled one)

- **How you get there:** ChatScreen renders `VideoPalScreen` *instead of* chat
  when the active Pal has video capability — `const isVideoPal = activePal && hasVideoCapability(activePal)`
  (`ChatScreen.tsx:66,251-254`), where `hasVideoCapability = pal.capabilities?.video === true`
  (`pocketpal-ai/src/utils/pal-capabilities.ts:8-10`; legacy pal type `'video'`
  maps to `{video:true, multimodal:true}`, `:64-77`).
- **Start gate:** camera start requires a loaded context and
  `modelStore.activeModelCaps.visionActive`, else an alert
  ("This model does not support image analysis…") —
  `pocketpal-ai/src/screens/ChatScreen/VideoPalScreen.tsx:118-140`.
- **Model bootstrapping:** if no model is loaded, it loads the Pal's
  `defaultModel`, resolving the model's `defaultProjectionModel` and calling
  `modelStore.initContext(palDefaultModel, projectionModelPath)`
  (`VideoPalScreen.tsx:56-105`).
- **Capture loop:** `EmbeddedVideoView` runs `setInterval` at
  `captureInterval` (default 1000 ms, adjustable 500–5000 ms in 500 ms steps
  via −/+ buttons, `pocketpal-ai/src/components/EmbeddedVideoView/EmbeddedVideoView.tsx:149-163,196-212`),
  each tick `takePhoto({flash:'off'})` → `RNFS.readFile(…,'base64')` → temp
  file unlinked → `data:image/jpeg;base64,…` → `onCapture`
  (`EmbeddedVideoView.tsx:95-126`). Preview stays live (`isActive={true}`,
  `:168-174`); response text overlays it in a `ResponseBubble` (`:177-183`).
- **Analysis:** `VideoPalScreen.handleImageCapture` throttles to the interval,
  then `modelStore.startImageCompletion({prompt, image_path: base64DataUrl,
  systemMessage: pal.systemPrompt, onToken…})`
  (`VideoPalScreen.tsx:187-231`) — one completion per capture, tokens streamed
  into the overlay. The prompt defaults to `"What do you see?"` and is
  user-editable (`:38`, ChatView `textInputProps` `:279-286`).
  `startImageCompletion` requires a context and `isMultimodalActive`
  (`pocketpal-ai/src/store/ModelStore.ts:3762-3773`; guards tested at
  `store/__tests__/ModelStore.test.ts:4046-4068`) and calls
  `context.completion` with system + content-array messages
  (`ModelStore.test.ts:4174-4202`, `file://` stripped from the URL).
- **Stop:** `stopCompletion()`, clear response, deactivate camera
  (`VideoPalScreen.tsx:151-166`).
- Interval, system prompt and model all come **from the Pal** — the coupling.

### 1c. Projector pairing + download (not profile-coupled)

- `VisionDownloadSheet` shows a vision toggle and a
  `ProjectionModelSelector` listing the repo's mmproj files (built via
  `getMmprojFiles(hfModel.siblings)`), then
  `modelStore.downloadHFModel(hfModel, modelFile, {enableVision, projectionModelId})`
  (`pocketpal-ai/src/components/VisionDownloadSheet/VisionDownloadSheet.tsx:45-96,56-73`).
- ModelStore synthesizes an explicit mmproj into a sibling model so detection
  and size-fit see it (`pocketpal-ai/src/store/ModelStore.ts:840-860`), lets the
  centralized downloader fetch it (`:2769-2790`), maintains a
  vision↔projector compatibility graph (`:2889-2910`), heals pairs on list sync
  (`:684-686`) and can't be stranded by a killed mmproj download (`:717`).
- At init, `initContext(model, projectionModelPath)` → `ctx.initMultimodal({path})`
  (`ModelStore.ts:2344-2351`).

### 1d. Remote vision

- Capability comes from llama.cpp's `GET /props` → `modalities.vision`, and the
  user-visible effect is the attach button's enabled state — the chain
  `/props → ServerStore.remoteCaps → resolveRemoteCaps → ChatInput isVisionEnabled`
  is documented and asserted end-to-end by PocketPal's own e2e
  (`pocketpal-ai/e2e/specs/features/remote-vision.spec.ts:1-23`), including a
  text-only sibling on the same router disabling it again.

### 1e. The availability decision — `visionActive`

`pocketpal-ai/src/utils/modelCaps.ts` is the single source of truth, two axes:

- **Axis 1 `vision`** — what the model *declares* (`'yes'|'no'|'unknown'`),
  meaningful for any model (`:14-31`).
- **Axis 2 `visionActive`** — what the *live session* can do, active model only
  (`:76-97`):
  - **Remote:** `visionActive = isActiveModel && confirmed.supportsVision === true`
    (probe only; the listed tier never answers this axis, `:87`).
  - **Local:** `visionActive = isActiveModel && env.isMultimodalActive`
    (`:96`) — i.e. a *runtime* flag set when the context was initialized with a
    projection model (§1c), not a declaration on disk.

Consumers: ChatScreen attach gate (`ChatScreen.tsx:107`), send path
(`useChatSession.ts:538`), camera-start gate (`VideoPalScreen.tsx:122`).

---

## 2. LiAI's vision feature today (verified from LiAI sources)

### 2a. Surfaces

- **Vision tab** — `app/(drawer)/(tabs)/vision.tsx`: full-screen live camera
  above the tab bar; permission raised on entry; question-driven: voice
  (`hooks/useVisionTurn.ts` — `bargeIn` state machine, speech recognition) or
  typed draft; on a question it snapshots **one frame**
  (`snapshotToBase64`, quality 50, `useVisionTurn.ts:143-152`) and calls
  `chatStore.send(text, [dataUri])` (`:175`), then TTS-plays the reply.
- **Chat composer attach (G8, shipped)** — `lib/chat/attachments.ts`:
  `pickImages` camera/gallery, `MAX_IMAGES = 5`, base64
  (`:49,53,63-79`), used from `components/chat/MessageInput.tsx:42,294` with a
  wrapping preview strip (audit `docs/research/2026-09-29-pocketpal-chat-feature-audit.md:281`).

### 2b. The pipeline below attach — mostly built, disconnected at both ends

| Link | Status | Evidence |
|---|---|---|
| attach → saved paths | ✅ works | `lib/chat/turn.ts:127-136` (a failed save is dropped, never the turn) |
| paths → agent | ✅ built | `turn.ts:146` spreads `imagePaths` into `runLocalAgent`; comment: *"Local reads imagePaths (llama media_paths); remote stays text-only"* |
| agent → llama.rn | ✅ built | `lib/inference/local-engine.ts:155-157` sends `media_paths` in completion params |
| mmproj attach at load | ✅ built, **never called** | loader accepts `mmprojPath` → `ctx.initMultimodal({path})` (`local-engine.ts:103,319-341`); `EngineManager.ensure(source, mmprojPath?, init?)` (`lib/inference/manager.ts:73-88`) — but the production call is `getManager().ensure(source)` **one argument** (`store/chat/index.ts:281`) |
| mmproj download | ❌ **missing** | `mmproj` appears only in `components/models/HFModelSearch.tsx` and `lib/models/hf-format.ts`; the file picker actively **filters mmproj out** (`HFModelSearch.tsx:396`), `visionSizeBreakdown` only computes the pair's *size* for the card (`lib/models/hf-format.ts:120-135`) |
| image gate | ❌ **hardcoded off** | `store/chat/send.ts:27-29` `function multimodalAvailable(): boolean { return false; }`; `send.ts:158` strips every image: `const images = multimodalAvailable() ? opts.images : undefined;` |
| strip warning | ⚠️ chat-only | `MULTIMODAL_WARNING` set as `chatWarning` (`send.ts:159-168`) — rendered by the chat screen; **the vision tab never renders it** (`app/(drawer)/(tabs)/vision.tsx` has no chatWarning surface) → silent downgrade |
| remote send | ❌ text-only | `lib/inference/remote-engine.ts` has no image handling (repo grep: no `images`/`image_url`); remote message content is a string |
| remote capability probe | ✅ captured, **no consumer** | `lib/models/remote-api.ts:87` `caps.supportsVision = modalities["vision"] === true` — recorded as a latent divergence in issue 06 ("No consumer reads it yet") |
| vision-capability gate on the vision tab | ❌ none | the tab gates only on engine readiness (`hooks/useModelReady.ts`, `selectEngineSource !== null`) — a text-only model can be asked "what am I seeing?" and answers blind |

Net: **LiAI can attach, persist and transport images to llama.rn on the local
path, and has the mmproj hook — but no projector is ever downloaded or loaded,
and a hardcoded `false` strips images from every turn before any of that.**

### 2c. Misleading docs on LiAI's side

- `vision.tsx` header (`app/(drawer)/(tabs)/vision.tsx:9-17`) describes a
  design that **does not exist in code**: a *"500ms JS interval [that]
  snapshots and uploads frames while idle/listening"*, a *"worklet frame
  processor … heartbeat"*, and a *"vision socket"* with HTTP fallback. Verified
  absent: no `frameProcessor` prop on the `Camera`
  (`components/VisionOverlays.tsx:43-53`), no socket anywhere in LiAI source,
  no capture interval. The real behavior is snapshot-on-question via
  `chatStore.send` (§2a).

---

## 3. Shape comparison (what each side actually does)

| Concern | PocketPal | LiAI today |
|---|---|---|
| Live camera vision | `VideoPalScreen` + `EmbeddedVideoView`: continuous capture loop, adjustable interval, text overlay of streaming answer | Vision tab: **one snapshot per question**, voice-first, TTS answer — no loop, no overlay stream |
| Activation | Pal capability (`pal.capabilities.video`) + model `visionActive` | Engine readiness only — **no capability check at all** |
| Composer attach | Always visible, *disabled* when `!visionActive` | Visible (G8), always accepted, then **silently stripped** |
| Local image transport | OpenAI content array via `context.completion` | llama.rn `media_paths` (equivalent, different wire shape) |
| Projector download | Sheet + selector, auto sibling synthesis, compatibility graph | **None** — mmproj filtered out of the file list |
| mmproj at load | `initContext(model, projPath)` → `initMultimodal` | `initMultimodal` exists, **never invoked** (call site passes no path) |
| Remote vision | `/props modalities.vision` → attach enablement (e2e-proven) | probe captured (`supportsVision`), **no consumer**, engine text-only |
| Can't-see warning | Chat warning (visible where the user is) | Chat screen only; **vision tab downgrades silently** |

---

## 4. Verdict

- PocketPal's **mechanics** worth having: capability-gated attach (always
  visible, disabled state), projector pairing + download, mmproj init at load,
  remote `/props`-driven enablement, an honest warning where the user stands.
- PocketPal's **structure** to NOT copy: everything driven by
  `pal.capabilities.video` and Pal-stored parameters (§5b).
- LiAI's **shape** (voice-first, snapshot-per-question, TTS, no profile step)
  matches the stated product direction and should be kept; it needs the
  *capability foundation* underneath it plus fixes for silent failures — not a
  replacement by PocketPal's loop.

---

## 5. Gap list

### (a) Port candidates — PocketPal has it, LiAI lacks it, NOT profile-coupled

| # | What | Why | Size |
|---|---|---|---|
| A1 | **Projector pairing + local vision activation**: download the paired mmproj alongside a vision model (PocketPal's sibling-synthesis pattern, `ModelStore.ts:840-860,2769-2790`), resolve its path at engine load and pass it (`store/chat/index.ts:281` → `ensure(source, mmprojPath)`; `manager.ts:73-88`, `local-engine.ts:337-341` already accept it), and set a runtime "multimodal active" flag feeding a `visionActive`-style resolver | Foundation for everything else; **both ends of the chain already exist** — only the download, the path resolution, and the flag are missing | Feature (the biggest item) |
| A2 | **Capability-driven attach gate**: a two-axis resolver like `modelCaps.ts` (declared vs live), local = A1's runtime flag, remote = the already-probed `supportsVision` (`remote-api.ts:87`); attach always rendered, disabled state when the model can't see (PocketPal `ChatInput.tsx:376`); warn *at the point of use* | Today attach is always accepted then stripped (`send.ts:158`); issue 06's latent `supportsVision` gets its consumer | Small after A1 |
| A3 | **Remote vision send**: build OpenAI content arrays in the remote engine when `supportsVision === true` (PocketPal's exact wire shape, `useChatSession.ts:87-97`; their e2e `remote-vision.spec.ts` proves the design) | Unlocks vision on remote providers with zero local memory cost; probe already ships | Medium |
| A4 | **Vision-tab honesty**: (i) gate/warn when the active model can't see (PocketPal alerts at camera start, `VideoPalScreen.tsx:122-133`); (ii) show the can't-see message **on the vision tab** — today's `chatWarning` is invisible there | Makes the existing tab truthful before A1 lands; (i)+(ii) are independent of A1 | Small |
| A5 | **Watch mode, amended (user decision, 2026-10-06):** continuous capture into a rolling buffer of recent frames is IN; automatic inference is OUT — vision answers **only** on an explicit chat or voice question, and the buffered frames ride along as multi-frame context ("what just moved?"). PocketPal's `VideoPalScreen` auto-send-per-frame loop remains the rejected half; its capture/interval mechanics are the ported part. Tracked as ticket 05 of `.scratch/vision-series/`. | Buffer + ask-only send (G8 multi-image already supports it) | Feature |

### (b) Profile-coupled — deliberately NOT porting (per the constraint)

- `pal.capabilities.video` deciding whether the surface exists
  (`pal-capabilities.ts:8-10`, `ChatScreen.tsx:66,251-254`) — LiAI gates on
  model capability instead.
- `activeVideoPal.defaultModel` + `defaultProjectionModel` auto-init
  (`VideoPalScreen.tsx:56-105`) — LiAI loads the active model as usual; A1
  attaches the projector to *that* load.
- `captureInterval` persisted as a Pal parameter
  (`VideoPalScreen.tsx:69-76,155-168`) — if A5 is built, store it as a
  user/UI setting, not on a profile.
- Pal `systemPrompt` feeding the analysis (`VideoPalScreen.tsx:183-185`) —
  LiAI uses the chat system prompt.
- `PalSheet` opened from the video screen (`VideoPalScreen.tsx:288-294`),
  legacy-type capability mapping (`pal-capabilities.ts:64-77`).

### (c) LiAI's own code to fix (independent of PocketPal)

| # | What | Size |
|---|---|---|
| C1 | **`multimodalAvailable()` hardcoded `false`** (`store/chat/send.ts:27-29`) — the single line that makes vision not-vision. Until A1 lands it should stay `false` *honestly*, but the strip must stop being silent (A4). When A1 lands this function becomes the capability resolver's read site | Trivial now, becomes A1's close-out |
| C2 | **`vision.tsx` header comment** describes a frame-stream/socket design that never existed (`vision.tsx:9-17`; §2c) — rewrite to the real behavior | Trivial |
| C3 | **Vision tab never shows the downgrade message** — `MULTIMODAL_WARNING` (`send.ts:32,159-168`) only reaches the chat screen (§2b) | Small (part of A4-ii) |
| C4 | **`supportsVision` has no consumer** (recorded in issue 06) — A2/A3 are its consumer; until then the vision tab could at least use it to pre-warn on remote | Small, rides with A2/A3 |
| C5 | **mmproj is size-shown but never fetched** — the models card prints "LLM + mmproj projector" (`HFModelSearch.tsx:430-431`, `hf-format.ts:116-135`) while `:396` filters mmproj out of the pick list and nothing else downloads it: the card promises a pair the app never acquires | Part of A1 |

### Suggested order

1. **C2** (doc fix, minutes) → **A4** (vision tab honesty, works today)
2. **A1 + C1 + C5** (projector pairing end-to-end — the feature)
3. **A2** (capability gate + disabled attach) → **A3** (remote vision)
4. **A5 (amended)** — watch mode as ticket 05: continuous capture buffer,
   inference strictly on user question (decided 2026-10-06).

---

## Sources

LiAI: `app/(drawer)/(tabs)/vision.tsx`, `hooks/useVisionTurn.ts`,
`hooks/useModelReady.ts`, `components/VisionOverlays.tsx`,
`components/chat/MessageInput.tsx`, `components/models/HFModelSearch.tsx`,
`lib/chat/attachments.ts`, `lib/chat/turn.ts`, `lib/inference/{local-engine,manager,remote-engine}.ts`,
`lib/models/{hf-format,remote-api}.ts`, `store/chat/{send,index}.ts`,
`docs/research/2026-09-29-pocketpal-chat-feature-audit.md`,
`.scratch/pocketpal-c-series/issues/06-remote-caps-probe.md`.

PocketPal: `src/utils/{modelCaps,pal-capabilities}.ts`,
`src/screens/ChatScreen/{ChatScreen,VideoPalScreen}.tsx`,
`src/components/{ChatInput/ChatInput,EmbeddedVideoView/EmbeddedVideoView,VisionDownloadSheet/VisionDownloadSheet}.tsx`,
`src/hooks/useChatSession.ts`, `src/store/ModelStore.ts`,
`e2e/specs/features/remote-vision.spec.ts`, `src/locales/en.json`.
