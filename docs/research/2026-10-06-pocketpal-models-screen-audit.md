# PocketPal AI — Models Screen: Feature & UI Audit

Date: 2026-10-06. Reference source: `D:\aivision\pocketpal-ai` (React Native + MobX + react-native-paper). User app: `D:\aivision`.

Scope: everything on the Models screen except the remote-model management feature (`RemoteModelSheet`, `ServerDetailsSheet`, `serverStore`, and `ModelSettingsSheet`'s remote reasoning override are noted but excluded from the gap list).

---

## 1. Where it lives & how you get there

- Route: `ROUTES.MODELS` drawer screen — `D:\aivision\pocketpal-ai\App.tsx` (Drawer.Screen `name={ROUTES.MODELS}`, `component={gestureHandlerRootHOC(ModelsScreen)}`, `options.headerRight: () => <ModelsHeaderRight />`, title from `currentL10n.screenTitles.models`).
- Entry point: drawer item via `D:\aivision\pocketpal-ai\src\components\SidebarContent\` (tested in `SidebarContent.test.tsx`).
- Screen file: `D:\aivision\pocketpal-ai\src\screens\ModelsScreen\ModelsScreen.tsx`.
- Sub-components (all under `D:\aivision\pocketpal-ai\src\screens\ModelsScreen\`):
  - `ModelCard/ModelCard.tsx` (+`styles.ts`)
  - `ModelAccordion/ModelAccordion.tsx`
  - `FABGroup/FABGroup.tsx`
  - `HFModelSearch/HFModelSearch.tsx`, `SearchView/SearchView.tsx`, `DetailsView/DetailsView.tsx`, `DetailsView/ModelFileCard/ModelFileCard.tsx`
  - `ModelSettings/ModelSettings.tsx`
  - `ChatTemplatePicker/ChatTemplatePicker.tsx`
- Header-right filter/menu: `D:\aivision\pocketpal-ai\src\components\ModelsHeaderRight\ModelsHeaderRight.tsx`
- Cross-screen sheets (from `D:\aivision\pocketpal-ai\src\components\`): `ModelSettingsSheet`, `DownloadErrorDialog`, `ErrorSnackbar`, `ModelErrorReportSheet`, `ModelsResetDialog`.

User app equivalent: route `D:\aivision\app\(drawer)\models.tsx` (+ `app\(drawer)\_layout.tsx`), header `D:\aivision\components\ScreenHeader.tsx`, models UI kit under `D:\aivision\components\models\` (`ModelCard.tsx`, `ModelCardDetails.tsx`, `ModelBits.tsx`, `AvailableModels.tsx` (preset card), `model-groups.ts`, `ModelAccordion.tsx`, `ModelsHeaderRight.tsx`, `FABGroup.tsx`, `HFModelSearch.tsx`, `ModelSettingsSheet.tsx`, `DownloadErrorDialog.tsx`, `RemoteModelSheet.tsx`). State: `D:\aivision\store\modelStore.ts` → `D:\aivision\store\models\` (`catalog.ts`, `downloads.ts`, `active.ts`, `persistence.ts`, `settings.ts`, `storage.ts`, `remote.ts`, `types.ts`), UI prefs in `D:\aivision\store\modelsUi.ts`.

---

## 2. Features (PocketPal, excluding remote-model management)

### 2.1 List structure
- Two built-in groups always present in the non-grouped view: **Ready to use** (`isDownloaded`) and **Available to download** (`!isDownloaded`), rendered as collapsible accordions: `ModelsScreen.tsx` (`groupedModels`, `UIStore.GROUP_KEYS.READY_TO_USE` / `AVAILABLE_TO_DOWNLOAD`, `D:\aivision\pocketpal-ai\src\store\UIStore.ts`).
- Grouped view (`grouped` filter): re-groups by model `type` / `ModelOrigin.LOCAL` ("Local model", `unknownGroup`), `ModelsScreen.tsx`.
- Expanded/collapsed state persisted in `uiStore.pageStates.modelsScreen.expandedGroups`.
- Pull-to-refresh (`RefreshControl`, `colors=[theme.colors.primary]`) → `modelStore.refreshDownloadStatuses()`.

### 2.2 Header filters & actions (`ModelsHeaderRight.tsx`)
- Menu anchored on a `tune-vertical` IconButton with three groups:
  - **Filters**: `hf` (HF-origin models, icon `icon-hf`/`icon-hf-light`), `downloaded` (icon `download-circle`/`download`).
  - **View**: `grouped` (icon `layers`/`layers-outline`).
  - **Actions**: `refresh` → `ModelsResetDialog` → `modelStore.resetModels()`.
- Filter state: `uiStore.pageStates.modelsScreen.filters`; when ungrouped, downloaded models sort first (`ModelsScreen.tsx` computed).

### 2.3 Model card (`ModelCard/ModelCard.tsx`, `styles.ts`)
- Card: `borderRadius: 24`, `margin: 6`, `theme.colors.background`, 1px `theme.colors.outline` border, `Card elevation={0}`.
- Header row: model-type icon (Eye `iconModelTypeVision` / Chat `iconModelTypeText`, 16px), name (`titleSmall`, `onSurface`, `numberOfLines={1}`, `ellipsizeMode="middle"`), right side: size text with CpuChip icon 10px, 12px `onSurfaceVariant` (or server link for remote), and an 8px status dot (`bgStatusActive` when loaded, `bgStatusIdle` when downloaded-but-idle).
- Expanded details (LayoutAnimation, 300ms): full model name block, `MemoryRequirement` component, capabilities line (`getModelSkills`, MTP badge), vision toggle (`Switch`), `ProjectionModelSelector`, 2-column technical-details grid (Parameters, Context length, Architecture, Author — each a `theme.colors.surface` rounded-16 sub-card, label 12 `onSurfaceVariant`, value 14 medium `onSurface`), missing-projection-model warning chip (`errorContainer` bg, `onErrorContainer` text), HuggingFace link row (`primaryContainer` border, `primary` text).
- Status/warning rows: memory warning and integrity error shown as error icon + 12px `error`-colored text rows; tapping memory warning opens a `Snackbar`.
- Download progress: `ProgressBar` height 8, radius 5, `theme.colors.tertiary`, plus right-aligned 12px `downloadSpeed`; container margins 18/6/12.
- Action buttons row (`gap: 8`):
  - Loading: disabled `Button` with spinner, `btnPrimaryBg`/`btnPrimaryBorder`.
  - Not downloaded: outlined **Download** (`btnDownloadBg`/`btnDownloadBorder`, disabled `surfaceDim`/`outline`, `btnDownloadText`), settings icon-button, remove (X, `error`) only for HF-origin, expand chevron.
  - Downloading: outlined **Cancel** (`errorContainer` bg, `error` border/text).
  - Downloaded: **Load** (primary `btnPrimaryBg/Border/Text`) or **Offload** (`btnReadyBg/Border/Text`), settings icon-button, delete (Trash, `error`), expand chevron. Load activates the model (`modelStore.selectModel`) and auto-navigates to Chat if `uiStore.autoNavigatetoChat`; active model toggles Load→Offload (`modelStore.manualReleaseContext()`).
  - Draft-only (MTP draft) models: Load button forced disabled with a 12px `onSurfaceVariant` hint.
- Delete flow: `Alert.alert` confirm; projection models have extra guard rails (`canDeleteProjectionModel`, dependent-model listing, special confirm copy).
- Vision toggle & projection model selection only when `model.supportsMultimodal`.
- HuggingFace link opens `model.hfUrl` (`LinkExternalIcon` + `primary` text).

### 2.4 FAB group (`FABGroup/FABGroup.tsx`)
- Paper `FAB.Group`, icon `plus`→`close`, backdrop `theme.colors.surface`.
- Actions: **Add from HuggingFace** (`icon-hf.png`), **Add Local Model** (`folder-plus`), **Add Remote Model** (excluded), **Manage Servers** (only when servers exist; excluded).

### 2.5 HF model search (`HFModelSearch/`)
- Full sheet (`Sheet` snapPoints 92%) → `SearchView`:
  - `EnhancedSearchBar` with filters popover (`hfStore.searchFilters`).
  - Results: author label (`labelMedium`), title, stats row — clock/download/heart 12px icons `onSurfaceVariant` + `formatNumber`, vision `ModelTypeTag` chip, gated-model `Chip` with lock icon.
  - Footer/empty states: "Loading more"; error (alert icon + message + hint, optional "disable token and retry" button); no results; nothing before query.
  - Infinite scroll (`onEndReached` debounced 1s → `hfStore.fetchMoreModels()`).
- Second sheet → `DetailsView`: author heading + vision/MTP chips, model title tooltip, chips (timeAgo, downloads, likes, trending), "Details" section title, list of gguf `ModelFileCard`s.

### 2.6 Model settings sheet (`D:\aivision\pocketpal-ai\src\components\ModelSettingsSheet\ModelSettingsSheet.tsx`)
- Full-height `Sheet` with `Sheet.ScrollView`.
- `ModelSettings` body (`src\screens\ModelsScreen\ModelSettings\ModelSettings.tsx`):
  - Rename: `TextInput` for model name.
  - Token settings: BOS / EOS / add-generation-prompt toggles (`Switch`) + token text inputs when enabled.
  - System prompt multiline `TextInput`.
  - Chat template: masked preview gradient (`MaskedView` + `LinearGradient`), edit button opens inner `Sheet` with `ChatTemplatePicker` + template textarea.
  - Stop words: removable `Chip`s + input that adds on submit.
- Multimodal section: `ProjectionModelSelector`.
- Reasoning override section: is-reasoning `Switch`, supports-effort `Switch`, effort-level multi-select `Chip`s (`EFFORT_LEVELS`), persisted only when dirty.
- Footer `Sheet.Actions`: Reset (text), Cancel (text), Save (contained).

### 2.7 Error & dialog surfaces
- `ErrorSnackbar` for HF search / download / model-load errors, with Retry (re-fetch / retryDownload / re-select model) and Report (`ModelErrorReportSheet`).
- `DownloadErrorDialog` in a `Portal` for download errors, with "try again".
- Persistent "Copying model…" snackbar during local-model copy; `RefreshControl` for status refresh.
- `ModelsResetDialog` (`src\components\ModelsResetDialog\`) → reset models to defaults.

### 2.8 Local model import (`ModelsScreen.tsx` `handleAddLocalModel`)
- `@react-native-documents/picker`, copies file into `DocumentDirectoryPath/models/local`, dedupes with keep-both counter, `modelStore.addLocalModel`.

---

## 3. Styling baseline in PocketPal

- `StyleSheet.create` per file via `createStyles(theme)`; `useTheme()` from `D:\aivision\pocketpal-ai\src\hooks`.
- All colors from `theme.colors.*` semantic tokens, never hex. Tokens seen: `surface`, `background`, `onSurface`, `onSurfaceVariant`, `outline`, `outlineVariant`, `surfaceDim`, `primary`, `primaryContainer`, `tertiary`, `tertiaryContainer`, `error`, `errorContainer`, `onErrorContainer`, `secondary`, `btnPrimaryBg/Border/Text`, `btnDownloadBg/Border/Text`, `btnReadyBg/Border/Text`, `bgStatusActive`, `bgStatusIdle`, `iconModelTypeVision`, `iconModelTypeText`.
- Components: react-native-paper (`Card`, `Button`, `Chip`, `Switch`, `ProgressBar`, `List.Accordion`, `Snackbar`, `Portal`, `IconButton`, `HelperText`, `TouchableRipple`), plus custom `Sheet` (gorhom), `Divider`, `EnhancedSearchBar`, `ModelTypeTag`, `MemoryRequirement`, `Menu`.
- Typography: paper variants (`titleSmall`, `headlineSmall`, `titleLarge`, `labelMedium`, `labelSmall`, `labelLarge`, `bodySmall`).
- Shape: cards radius 24, inner panels 16, pills radius 6–8; list bottom padding 150 for the FAB.

## 4. User-app parity status (refreshed 2026-10-06, after the port)

Styling: Uniwind className, tokens in `D:\aivision\themes\tokens.ts` (`colors.*`), Tailwind-ish utilities (`rounded-lg`, `bg-surface-1`, `border-border`, `font-sans-semibold text-body-md`…), inline styles only for safe-area / dynamic values.

Legend: **ported** = landed in this session · **present** = already there before · **decision** = deliberately out.

| PocketPal element (§2) | Status | Where (user app) |
|---|---|---|
| Drawer entry to Models | present | `app\(drawer)\_layout.tsx`, `app\(drawer)\models.tsx` |
| Ready to use / Available to download groups | present | `lib\models\model-groups.ts` + `app\(drawer)\models.tsx`, `ModelAccordion.tsx` |
| Accordion expand/collapse + persisted open state | present | `store\modelsUi.ts`, `models.tsx` |
| Header filter menu (downloaded / hf / grouped / expand-all) | present | `components\models\ModelsHeaderRight.tsx` |
| Reset models action + confirm dialog | **ported** | `store\models\settings.ts` `resetModelSettings`, `ModelsHeaderRight.tsx` "Reset models" row, `Alert` confirm in `models.tsx` |
| Pull-to-refresh (`RefreshControl` → disk re-stat) | **ported** | `models.tsx` → `reconcileInterrupted()` + `loadPresets()` |
| Model card header (type icon, name, size, status dot) | present | `ModelCard.tsx`, `ModelBits.tsx` |
| Card expand details | present | `ModelCard.tsx` + `ModelCardDetails.tsx` |
| Memory requirement (estimate) + memory-pressure warning | **ported** | `ModelCardDetails.tsx` via `estimateModelMemory` + `readTotalMemory()` (warns above ~90% of device RAM) |
| Details grid as 2-column rounded sub-cards (Parameters / Context length / Architecture / Author) | **ported** | `ModelCardDetails.tsx` `DetailCell`; context length = current `nCtx` from the inference store |
| Capabilities chips + MTP badge | **ported** | `ModelCardDetails.tsx` — chips per `capabilities`, MTP badge on `/mtp\|speculative/i` match (no GGUF metadata exists to read it from) |
| File-integrity error row | present | `ModelCardDetails.tsx` (`checkModelFileIntegrity`) |
| HuggingFace link row | **ported** | `hfUrl?: string` on `ModelSpec`, set in `buildHfModelSpec`, rendered in `ModelCardDetails.tsx` |
| Download progress bar + speed | present | `ModelBits.tsx`, `store\models\downloads.ts` |
| Download / pause / resume / cancel / retry | present | `store\models\downloads.ts`, `ModelCard.tsx` |
| Load / Offload (activate / release) | present | `store\models\active.ts`, `ModelCard.tsx` |
| Delete model | present | `store\models\catalog.ts` `removeModel` |
| Auto-navigate to chat after activation | present | `models.tsx`, `store\modelsUi.ts` |
| Settings sheet: rename, system prompt | present | `components\models\ModelSettingsSheet.tsx` |
| Settings sheet: stop words as removable chips + add-input | **ported** | `ModelSettingsSheet.tsx` (replaced the textarea) |
| Settings sheet: BOS/EOS toggles + token inputs, add-generation-prompt toggle | **ported** | `ModelSettingsSheet.tsx`; fields on `ModelSettings` (`types\models.ts`), parsed in `lib\model-settings.ts` |
| Settings sheet: chat-template editor (masked preview + Edit) | **ported** | `ModelSettingsSheet.tsx` — raw textarea only, no template registry (decision) |
| Stop words actually stop generation | **ported (bug fix)** | `CompletionRequest.stop` → llama.rn `stop` (flat) + OpenAI `stop`; `runner.ts` → `turn.ts` (`getStopWords`) → `store\chat\index.ts` `defaultStopWords` |
| EOS token joins the stop list when enabled | **ported** | `defaultStopWords()` in `store\chat\index.ts` |
| Custom chat template reaches the engine | **ported** | `CompletionRequest.chatTemplate` → llama.rn `chat_template` |
| add-generation-prompt override reaches the engine | **ported** | `CompletionRequest.addGenerationPrompt` → `add_generation_prompt`; tri-state in `ModelSettings` so an untouched model keeps llama.cpp's default (true) while an explicit `false` is honored |
| BOS token injection | decision (inert) | `ModelSettings.addBosToken`/`bosToken` persisted + toggle shown for UI parity; llama.rn exposes no BOS param, and prepending BOS to the first user message would corrupt templates that don't expect it |
| HF search error surface with Retry | **ported** | `SearchErrorSnackbar` in `HFModelSearch.tsx` (uses the shared `useSnackbar`; the Report half dropped) |
| "Copying model…" feedback during local import | **ported** | `hooks\useLocalModelImport.ts` (in-progress + success snackbars) |
| Empty state on a fresh install | **ported** | `models.tsx` `catalogCount === 0` row |
| Vision toggle + projection-model selector, missing-projection warning | **ported** | `ModelCardDetails.tsx` (ToggleRow + `ProjectorSelectorSheet.tsx` + "Download projection model" chip), rules in `lib\models\vision-pairing.ts`, gate in `lib\inference\mmproj.ts`. Decision: `docs\specs\2026-10-06-vision-toggle-and-projector-selection.md` |
| Remote-model management (RemoteModelSheet, servers) | out of scope | excluded by request; present in the app already (`RemoteModelSheet.tsx`, `store\models\remote.ts`) |
| Pals, Benchmark, DevTools screens | out of scope | pocketpal-ai-only features |

## 5. Open items (nothing blocking)

1. **No node coverage for the native template/EOS path.** `chat_template`, `add_generation_prompt` and `stop` are forwarded structurally but only a real llama.rn context exercises them. Manual check: set a custom template + `addGenerationPrompt=false` on a downloaded model and confirm the turn still shapes correctly.
2. **MTP badge is string-matched.** It is honest about being best-effort (there is no GGUF metadata source), but a model that declares MTP capability under another word will not show the badge.
3. **`resetModels` semantics differ by design.** PocketPal resets each model's default chat template / stop words in place; the app's overrides live in one central map, so "reset" clears the map. Downloaded files and the catalog are untouched.
3. **A projector is not a model row.** pocketpal makes projectors first-class `Model` entries (`modelType: PROJECTION`) referenced by id; LiAI keeps `spec.projector` inline and downloads it as a second leg of the same job. One downloader, one progress bar, one integrity story.
4. **Chat-template registry intentionally absent.** The editor is a raw textarea; a picker would be a list of templates nothing validates.
5. **Projector candidates are frozen at build time.** A repo that adds an mmproj later will not offer it until the model is re-bookmarked from search; `supportsVision` for pre-existing rows is inferred from a recorded projector or the filename-derived type.

---

## 6. 2026-10-09 — "copy it 100%, in our style and stack" — slice 1: the group list

Decision: rebuild the screen skeleton to the reference's structure and copy
its strings verbatim, keeping LiAI's tokens, type scale and Uniwind classes.

Applied:

- `lib/models/model-groups.ts` (new) — the grouping itself, pure and tested
  (`tests/model-groups.test.ts`): two fixed buckets when `grouped` is off,
  one group per model type when it is on, "Local" for a local model,
  "Unknown" when there is no type, empty groups dropped.
- `store/modelsUi.ts` — expansion is now `expandedGroups: Record<groupKey,
  boolean>` (PocketPal `UIStore.ts:28-30`), persisted, default
  `{ready_to_use: true}`. `setOpen`/`setAllOpen` are gone with the two fixed
  sections they named; old payloads fall back to the default expansion.
- `app/(drawer)/models.tsx` — a FlatList whose items are groups, each an
  accordion over its models (PocketParity `ModelsScreen.tsx:397-412`,
  `:346-377`). The screen now resolves each group item to its card.
- `components/models/ModelAccordion.tsx` — title + optional description, no
  count chip (the reference has no count).
- `components/models/ModelsHeaderRight.tsx` — verbatim menu copy
  ("Hugging Face Models", "Downloaded Models", "Group by Model Type",
  "Reset Models List").
- Deleted `components/models/ReadyModels.tsx`; `AvailableModels.tsx` is now
  the preset card alone.

Deliberate divergences:

1. **Device-tier grouping is gone.** It was ours, not the reference's; the
   `grouped` filter now means what it means there.
2. **No expand/collapse-all menu rows.** The reference's menu has none
   (`ModelsHeaderRight.tsx:73-115`).
3. **The downloaded-first sort is not implemented.** The reference applies it
   when `grouped` is off (`:280-289`); our two buckets already split on
   downloaded/available, so it would be a no-op.
4. **The `downloaded` filter hides remote providers too.** They are never
   `isDownloaded` there, so the reference hides them as well.


Slice 2 — the compact card:

- `lib/models/card-actions.ts` (new, tested) decides the action row; the card
  draws it. A transfer in flight reduces the row to Cancel (ModelCard.tsx
  :426-453); a bookmark gets Download · Settings · Remove · expand
  (:455-527); a downloaded model gets Load/Offload · Settings · Delete ·
  expand (:530-586).
- `components/models/ModelCard.tsx`: 24px radius card, compact header (type
  icon + middle-elided name + size + status dot), the author line and the
  type/size/file-count chips removed, the chevron moved out of the header
  into the action row, Load/Offload at 40px with a 16px radius and 40px
  icon buttons, and the destructive action now confirms first with the
  reference's own wording.
- The status dot now appears whenever a file is on disk — green loaded,
  grey merely downloaded (:314-327), where before it showed only when
  loaded.

Divergences:

1. **Pause/Resume stays.** The reference has no paused state at all; ours
   keeps it, by request.
2. **"Offload" for the loaded model's button** (en.json
   `modelCard.buttons.offload`), matching the reference's vocabulary. The
   engine-level operation is still named Unload elsewhere.
3. **The progress bar stays on the card**, and the whole group column is
   one list rather than the reference's nested FlatList per group. The
   latter is a deliberate shortcut, noted in `models.tsx`.

Slice 3 — HF search + details (mostly already there):

Checked against the reference rather than rebuilt. Already in place before
this pass: two stacked sheets (search under, details over —
`HFModelSearch.tsx` testIDs `hf-search-sheet` / `hf-details-sheet`), the
author filter and sort sheets, infinite scroll from the Hub's Link header,
per-result and per-detail stats (updated / downloads / likes / trending),
the "Requires Token" chip on a gated RESULT, the auth-failure hint with
"Disable Token & Retry", the warning chip and its numbered snackbar, the
vision chip opening VisionDownloadSheet, per-file bookmarks, and cancel
while a file transfers.

Two gaps closed:

1. **The details sheet's section heading** said "Files"; it now says
   "Available GGUF Files" (en.json `models.details.title`), which is what
   names the file kind.
2. **A gated FILE carries no chip**, only the result row did
   (PocketParity ModelFileCard.tsx:323-338). Without it the download 401s
   halfway with nothing on screen to explain why.

Locked by `tests/hf-details-sheet.test.ts` (source assertions — the sheet
mounts native components, so the runner cannot render it).
