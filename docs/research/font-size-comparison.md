# Font size comparison: pocketpal-ai vs LiAI

> **Status: shipped.** This survey drove the pocketpal font-size mirror
> (grilling Q1–Q7): the LiAI column below is the PRE-mirror state. The
> post-mirror scale lives in DESIGN.md (Hierarchy) and `global.css`.
> Two off-scale rows were NOT copied literally and are recorded
> deviations: pocketpal's suggested-prompt chip is 13px (kept at Body
> Small 12), and their composer hint line-height is 11/14 (kept at
> Label 11/16 — our `text-xs` rung; the tab bar's own 11/14 IS pinned).

Scope: same UI sections in both apps, per-section font size in px with the
variant/class and `file:line` for every number. Delta = LiAI − pocketpal
(positive = LiAI renders bigger).

Method note for PocketPal: its Paper theme overrides **font families only** —
`configureFonts` in `pocketpal-ai/src/utils/theme.ts:34-78` never sets a
`fontSize` on an MD3 variant, and the test suite pins only families
(`pocketpal-ai/src/utils/__tests__/theme.test.ts:106-131`). So variant→px for
PocketPal comes from react-native-paper 5.14.5's MD3 typescale
(`pocketpal-ai/package.json:76` pins the version).

## PocketPal: MD3 variant → px (paper 5.14.5, inherited — no override)

| Variant | px | line-height | Source |
|---|---|---|---|
| `titleSmall` | 14 | 20 | `pocketpal-ai/node_modules/react-native-paper/lib/commonjs/styles/themes/v3/tokens.js:161-165` |
| `titleMedium` | 16 | 24 | `…/v3/tokens.js:156-159` |
| `titleLarge` | 22 | 28 | `…/v3/tokens.js:151-154` |
| `headlineSmall` | 24 | 32 | `…/v3/tokens.js:146-149` |
| `bodyLarge` | 16 | 24 | `…/v3/tokens.js:185-190` |
| `bodyMedium` | 14 | 20 | `…/v3/tokens.js:192-198` |
| `bodySmall` | 12 | 16 | `…/v3/tokens.js:200-206` |
| `labelLarge` | 14 | 20 | `…/v3/tokens.js:167-171` |
| `labelMedium` | 12 | 16 | `…/v3/tokens.js:173-177` |
| `labelSmall` | 11 | 16 | `…/v3/tokens.js:179-183` |

Merge semantics: `configureFonts` spreads the per-variant config **over** this
typescale without touching `fontSize` when none is given
(`…/styles/fonts.js:73-89`). Custom legacy text styles (message bodies, input,
date divider, etc.) **do** set explicit sizes and live in
`pocketpal-ai/src/utils/theme.ts:133-212`.

LiAI's scale for comparison (`global.css:62-77`, mirrored in
`themes/tokens.ts:60-69`): h1 32/40 · h2 24/32 · h3 20/28 · h4 16/24 ·
body-lg 16/24 · body-md 14/20 · body-sm 12/16 · caption 12/16.

## Side-by-side table

| Section | PocketPal px (variant, file:line) | LiAI px (class, file:line) | Δ |
|---|---|---|---|
| **Chat header — title** | 14 / lh 20 — `titleSmall`, `pocketpal-ai/src/components/ChatHeaderTitle/ChatHeaderTitle.tsx:20` (size from `tokens.js:161-165`) | 24 / lh 32 — `text-h2`, `app/(drawer)/(tabs)/chat.tsx:211` (`global.css:64-65`) | **+10** (lh +12) |
| **Chat header — subtitle (model name)** | 12 / lh 16 — `bodySmall`, `ChatHeaderTitle.tsx:24` (size from `tokens.js:200-206`) | none — header renders only the app name, `chat.tsx:206-214` | n/a (PP only) |
| **Drawer/screen title (Settings, Models, About)** | 14 / lh 20 — `titleSmall` via `headerTitleStyle`, `pocketpal-ai/App.tsx:125`, `App.tsx:244-246` | 24 / lh 32 — `text-h2`, `components/ScreenHeader.tsx:44` (`global.css:64-65`) | **+10** |
| **Drawer title (app name)** | none — SidebarContent has no title row (`pocketpal-ai/src/components/SidebarContent/SidebarContent.tsx:475-484` only renders date sections) | 24 — `text-h2`, `components/AppDrawer.tsx:63` | LiAI-only |
| **Message body — assistant** | 16 — `MarkdownView` tag `body`, `pocketpal-ai/src/components/MarkdownView/styles.ts:13-15` | 14 — `fontSize: 14`, `components/chat/MarkdownView.tsx:29-33` | −2 |
| **Message body — user bubble** | 16 / lh 24 — `sentMessageBodyTextStyle`, `pocketpal-ai/src/utils/theme.ts:180-183`, applied at `TextMessage/styles.ts:35-39` | 14 / lh 20 — `text-body-md`, `components/chat/MessageListItem.tsx:83` (`global.css:72-73`) | −2 (lh −4) |
| **Message body — DS shell** | 16 / lh 24 — `theme.typography.bodyM`, `pocketpal-ai/src/theme/tokens/typography.ts:87-92`, used by `ui/MessageContent/styles.ts:41-44` (not on the chat render path) | — | n/a |
| **Author name (chat)** | 12 / lh 16 — `userNameTextStyle`, `pocketpal-ai/src/utils/theme.ts:210-212`, applied at `TextMessage/styles.ts:22-23` | 12 / lh 16 — `text-caption`, `components/chat/MessageListItem.tsx:113` (`global.css:76-77`) | 0 |
| **Timestamp / date divider** | no per-message clock text found on the chat path; date divider 12 / lh 16 — `dateDividerTextStyle`, `pocketpal-ai/src/utils/theme.ts:138-142`, rendered at `Message/Message.tsx:167-173`; assistant footer timing 10 — `AssistantTurnFooter/styles.ts:13-16` | 12 / lh 16 — `text-caption`, `MessageListItem.tsx:94` and `:114-116`, date header `components/chat/DateHeader.tsx:10` | +2 vs PP footer (10); 0 vs PP date divider (12) |
| **Composer — input text** | 16 / lh 24 — `inputTextStyle`, `pocketpal-ai/src/utils/theme.ts:151-153`, applied at `ChatInput/styles.ts:73-79` | 14 / lh 20 — `text-body-md`, `components/chat/MessageInput.tsx:356` (`global.css:72-73`) | −2 |
| **Composer — helper/hint text** | 11 / lh 14 — `ChatInput/styles.ts:271-275`; edit-bar label 11 — `labelSmall`, `ChatInput.tsx:401` | 12 / lh 16 — `text-body-sm`, `MessageInput.tsx:274`, `:279`, `:284` | +1 |
| **Composer — chip/toggle labels** | 12 — `ChatInput/styles.ts:54-58` (thinking toggle), 10 — `palNameCompact`, `ChatInput/styles.ts:155-163` | 14 — `text-body-md`, `MessageInput.tsx:433` (menu row labels) | +2 / +4 |
| **Drawer — nav item labels** | 14 / lh 20 — `labelLarge`, `paper …/Drawer/DrawerItem.js:88` (size `tokens.js:167-171`), used at `SidebarContent.tsx:540-569` | 14 / lh 20 — `text-body-md`, `components/AppDrawer.tsx:130` (`global.css:72-73`) | 0 |
| **Drawer — session row title** | 14 — `labelLarge` via `Drawer.Item`, `pocketpal-ai/src/components/SidebarContent/SidebarContent.tsx:108-110` | 14 — `text-body-md`, `components/chat/SessionList.tsx:90-97` | 0 |
| **Drawer — session row preview line** | none — `Drawer.Item` has a single label (`SidebarContent.tsx:110`) | 12 — `text-body-sm`, `SessionList.tsx:98-100` | LiAI-only |
| **Drawer — section/date label** | 12 — `bodySmall`, `SidebarContent.tsx:479` | 12 — `text-body-sm`, `SessionList.tsx:60-62` ("History") | 0 |
| **Drawer — version label** | 12 — `SidebarContent/styles.ts:28-33` | 12 — `text-caption`, `AppDrawer.tsx:105-107` | 0 |
| **Settings — row label** | 16 / lh 24 — `titleMedium`, `pocketpal-ai/src/screens/SettingsScreen/SettingsScreen.tsx:373` (no size override in `styles.ts:44-46`) | 16 / lh 24 — `text-body-lg`, `components/settings-rows.tsx` `RowSize` default | 0 |
| **Settings — row description** | 11 / lh 16 — `labelSmall`, `SettingsScreen.tsx:378` (no size override in `styles.ts:47-50`) | 11 / lh 16 — `text-xs`, `components/settings-rows.tsx` `RowSize` default; only on load-bearing rows | 0 |
| **Settings — card title** | 16 / lh 24 regular — Paper v5 `CardTitle.tsx` (`titleVariant` defaults to `bodyLarge`, `paddingLeft: 16`), rendered unstyled by `SettingsScreen.tsx` | 16 / lh 24 regular — `.card-title`, `global.css`; rendered inside the 16px-padded card by `SettingsSection title` | 0 |
| **Settings — advanced accordion** | 14 — `accordionTitle`, `pocketpal-ai/src/screens/SettingsScreen/styles.ts:110-113` | 14 / lh 20 — `text-title`, `AdvancedGroup` in `components/settings-rows.tsx` | 0 |
| **Generation settings — param label** | 11 — `labelSmall`, `pocketpal-ai/src/components/CompletionSettings/CompletionSettings.tsx:40` and `:65` | 11 — `text-xs` via `RowSizeProvider`, `components/chat/sampler-rows.tsx:59` | 0 |
| **Generation settings — param description** | 12 — `CompletionSettings/styles.ts:69-74`, slider description `components/InputSlider/styles.ts:11-16` | 12 — `text-body-sm` via the same `RowSizeProvider`, `components/chat/sampler-rows.tsx:59` | 0 |
| **Generation settings — numeric field value** | 16 — `inputLabel`, `CompletionSettings/styles.ts:51-55` | 16 — `text-body-lg`, `SliderRow` input in `components/settings-rows.tsx` | 0 |
| **Models — section header** | 14 — `accordionTitle`, `pocketpal-ai/src/screens/ModelsScreen/ModelAccordion/styles.ts:10-12`, applied at `ModelAccordion.tsx:41-44` | 16 / lh 24 — `text-h4`, `components/models/ModelAccordion.tsx:52` (`global.css:68-69`) | **+2** |
| **Models — section header sub-line** | 12 — `accordionDescription`, `ModelAccordion/styles.ts:13-16` | 12 — `text-caption`, `ModelAccordion.tsx:54` | 0 |
| **Models — card name** | 14 — `titleSmall`, `pocketpal-ai/src/screens/ModelsScreen/ModelCard/ModelCard.tsx:702-703` | 14 — `text-body-md`, `components/models/ModelCard.tsx:80`, `:224` | 0 |
| **Models — card meta / description** | 12 — `sizeInfoText` `ModelCard/styles.ts:95-97`; description 14 / lh 20 `ModelCard/styles.ts:126-129` | 12 — `text-body-sm`, `ModelCard.tsx:226`; detail values 14 `components/models/ModelCardDetails.tsx:105`, `:110` | 0 |
| **Models — search input** | 16 — `EnhancedSearchBar/styles.ts:36-44` | 14 — `text-body-md`, `components/models/HFModelSearch.tsx:190` | −2 |
| **Menus — menu item label** | 16 / lh 24 — `bodyLarge`, `paper …/Menu/MenuItem.js:119` (size `tokens.js:185-190`), PocketPal wraps it in `components/Menu/Menu.tsx` | 14 / lh 20 — `text-body-md`, `components/chat/ChatMenu.tsx:83` | −2 |
| **Dialog — title** | 24 — `headlineSmall`, `paper …/Dialog/DialogTitle.js:61` (size `tokens.js:146-149`); custom titles 16 — `pocketpal-ai/src/components/Dialog/styles.ts:18-21` | 20 / lh 28 — `text-h3`, rename dialog `components/chat/SessionList.tsx:144` | −4 vs paper title, +4 vs custom title |
| **Dialog — action buttons** | 14 — `labelLarge`, `paper …/Button/Button.js:163`, `:215` | 14 — `text-body-md`, `SessionList.tsx:163`, `:172` | 0 |
| **Empty chat — placeholder title** | 16 / lh 24 — `emptyChatPlaceholderTextStyle`, `pocketpal-ai/src/utils/theme.ts:145-148` | 20 / lh 28 — `text-h3`, `components/chat/ChatEmptyPlaceholder.tsx:55` | **+4** |
| **Empty chat — suggested prompts** | 13 — `pocketpal-ai/src/components/SuggestedPromptsRow/styles.ts:29` | 12 — `text-body-sm`, `components/chat/SuggestedPrompts.tsx:34` | −1 |

## Findings — concrete causes only

1. **Every screen title is +10px.** Chat header 24 vs 14
   (`chat.tsx:211` vs `ChatHeaderTitle.tsx:20`), Settings/Models/About headers
   24 vs 14 (`ScreenHeader.tsx:44` vs `App.tsx:244-246`), drawer title 24 with
   no PocketPal counterpart (`AppDrawer.tsx:63`). Line-height grows with it:
   32 vs 20 (`global.css:64-65` vs `tokens.js:164-165`) = +12px of line box per
   title line.
2. **Settings descriptions now match at 11/16.** LiAI renders them at the same
   `labelSmall` rung (`components/settings-rows.tsx` `text-xs` vs
   `SettingsScreen.tsx:378`) and only where they carry consequence — consent,
   cost, errors, limits. The old 14/20 claim in this file was stale.
3. **Generation-settings labels match at 11/12.** The sheet pins PocketPal's
   CompletionSettings rungs via `RowSizeProvider label="text-xs"
   desc="text-body-sm"` (`components/chat/sampler-rows.tsx:59`), the same
   `labelSmall` 11 and 12px description the reference uses
   (`CompletionSettings.tsx:40`, `:65`; `CompletionSettings/styles.ts:69-74`).
   The old 16/14 claim in this file cited the pre-refactor filename.
4. **Settings card titles are a 0px match.** LiAI restores PocketPal's
   `Card.Title` at 16/24 regular (`.card-title`, `global.css`) inside the
   16px-padded card; the reference's is Paper `bodyLarge` (16/24 regular) at
   the same inset. The previous 20/28 group heading is gone.
5. **Models section headers +2px** — 16 vs 14 (`ModelAccordion.tsx:52` vs
   `ModelAccordion/styles.ts:10-12`); card names and meta match at 14/12.
6. **Empty-state placeholder +4px** — 20 vs 16 (`ChatEmptyPlaceholder.tsx:55`
   vs `theme.ts:145-148`).
7. **Captions: mostly equal, a few +1/+2.** Author name, session previews,
   drawer labels, date dividers all sit at 12 in both (`MessageListItem.tsx:113`,
   `SessionList.tsx:60,98`, `SidebarContent.tsx:479`). Where PocketPal goes
   below 12 — assistant footer timing 10 (`AssistantTurnFooter/styles.ts:13-16`),
   composer hints 11 (`ChatInput/styles.ts:271-275`), settings descriptions 11 —
   LiAI stays at 12/14, i.e. +1 to +3.
8. **Counter-examples (LiAI reads smaller):** message body 14 vs 16
   (`MarkdownView.tsx:31` vs `MarkdownView/styles.ts:15`), user bubble 14 vs 16
   (`MessageListItem.tsx:83` vs `theme.ts:180-183`), composer input 14 vs 16
   (`MessageInput.tsx:356` vs `theme.ts:151-153`), menu items 14 vs 16
   (`ChatMenu.tsx:83` vs `MenuItem.js:119`). The perceived size difference is
   driven by titles, section headers and descriptions, not by body copy.
9. **Markdown headings inside bubbles:** LiAI passes only family/color for
   `h1`–`h6` (`MarkdownView.tsx:38-41`, `:56-61`), so react-native-marked's
   defaults apply: h1 32, h2 28, h3 24, h4 22
   (`node_modules/react-native-marked/src/theme/styles.ts:76-118`, user styles
   are appended after the defaults at `:88`, `:100`, `:109`, `:118`).
   PocketPal's tags styles define no heading entries — only `body` 16, `code`
   12, `pre` 14, thinking 14 (`MarkdownView/styles.ts:12-69`) — so its heading
   sizes fall back to react-native-render-html defaults, which are not pinned
   anywhere in this repo (no numeric comparison possible from these trees).

## Sources

Paths are repo-relative to `D:\aivision`.

### PocketPal (`pocketpal-ai/`)
- `pocketpal-ai/package.json` (:56 `marked`, :76 `react-native-paper` 5.14.5, :80 `react-native-render-html`)
- `pocketpal-ai/App.tsx` (:114-125 headerTitleStyle, :244-246 headerTitle)
- `pocketpal-ai/src/utils/theme.ts` (:34-78 configureFonts overrides, :133-212 legacy text styles)
- `pocketpal-ai/src/utils/__tests__/theme.test.ts` (:87-131 family pins)
- `pocketpal-ai/src/theme/tokens/typography.ts` (:85-181 token scale)
- `pocketpal-ai/src/components/ChatHeaderTitle/ChatHeaderTitle.tsx` (:20, :24)
- `pocketpal-ai/src/components/MarkdownView/styles.ts` (:12-69)
- `pocketpal-ai/src/components/MarkdownView/MarkdownView.tsx` (RenderHTMLSource path)
- `pocketpal-ai/src/components/TextMessage/styles.ts` (:16-46)
- `pocketpal-ai/src/components/Message/Message.tsx` (:164-176 date divider)
- `pocketpal-ai/src/components/AssistantTurnFooter/styles.ts` (:13-20)
- `pocketpal-ai/src/components/ChatInput/ChatInput.tsx` (:401, :465, :646)
- `pocketpal-ai/src/components/ChatInput/styles.ts` (:54-58, :73-79, :155-163, :271-275)
- `pocketpal-ai/src/components/SidebarContent/SidebarContent.tsx` (:108-110, :479, :540-569)
- `pocketpal-ai/src/components/SidebarContent/styles.ts` (:28-33)
- `pocketpal-ai/src/screens/SettingsScreen/SettingsScreen.tsx` (:373, :378)
- `pocketpal-ai/src/screens/SettingsScreen/styles.ts` (:44-50)
- `pocketpal-ai/src/components/CompletionSettings/CompletionSettings.tsx` (:40, :65, :93, :154)
- `pocketpal-ai/src/components/CompletionSettings/styles.ts` (:51-55, :69-74)
- `pocketpal-ai/src/components/InputSlider/styles.ts` (:11-16)
- `pocketpal-ai/src/screens/ModelsScreen/ModelAccordion/ModelAccordion.tsx` (:38-46)
- `pocketpal-ai/src/screens/ModelsScreen/ModelAccordion/styles.ts` (:10-16)
- `pocketpal-ai/src/screens/ModelsScreen/ModelCard/ModelCard.tsx` (:702-703)
- `pocketpal-ai/src/screens/ModelsScreen/ModelCard/styles.ts` (:95-97, :126-129, :143-151)
- `pocketpal-ai/src/components/Dialog/styles.ts` (:18-21)
- `pocketpal-ai/src/components/EnhancedSearchBar/styles.ts` (:36-44)
- `pocketpal-ai/src/components/SuggestedPromptsRow/styles.ts` (:29)

### react-native-paper 5.14.5 (PocketPal's dependency)
- `pocketpal-ai/node_modules/react-native-paper/package.json` (version 5.14.5)
- `pocketpal-ai/node_modules/react-native-paper/lib/commonjs/styles/themes/v3/tokens.js` (:120-206 typescale)
- `pocketpal-ai/node_modules/react-native-paper/lib/commonjs/styles/fonts.js` (:73-89 merge behavior)
- `pocketpal-ai/node_modules/react-native-paper/lib/commonjs/components/Drawer/DrawerItem.js` (:88)
- `pocketpal-ai/node_modules/react-native-paper/lib/commonjs/components/Menu/MenuItem.js` (:119)
- `pocketpal-ai/node_modules/react-native-paper/lib/commonjs/components/Dialog/DialogTitle.js` (:61)
- `pocketpal-ai/node_modules/react-native-paper/lib/commonjs/components/Button/Button.js` (:163, :215)

Note: `pocketpal-ai` ships no checked-in `node_modules`; the five paper files
above were extracted from the exact npm tarball pinned at
`pocketpal-ai/package.json:76` so the variant→px claims cite real file:line
instead of memory. They are gitignored build/dependency files.

### LiAI
- `global.css` (:62-77 `--text-*` scale, :257-261 `.seg-label`)
- `themes/tokens.ts` (:60-69 `typeScale`)
- `app/(drawer)/(tabs)/chat.tsx` (:184, :211, :259, :262)
- `components/ScreenHeader.tsx` (:38-47)
- `components/AppDrawer.tsx` (:63-65, :105-107, :130)
- `components/chat/MessageListItem.tsx` (:64-69, :83, :94, :113-116, :139, :147)
- `components/chat/MarkdownView.tsx` (:29-33, :38-41, :49-75)
- `components/chat/MessageInput.tsx` (:274, :279, :284, :356, :433)
- `components/chat/SessionList.tsx` (:60-62, :90-100, :144, :163, :172)
- `components/chat/DateHeader.tsx` (:10)
- `components/chat/ChatEmptyPlaceholder.tsx` (:55, :58)
- `components/chat/SuggestedPrompts.tsx` (:34)
- `components/chat/ChatMenu.tsx` (:83)
- `components/settings-rows.tsx` (:26-38 RowLabel, :57, :62, SliderRow input)
- `components/chat/sampler-rows.tsx` (:58-238)
- `components/models/ModelAccordion.tsx` (:52, :54)
- `components/models/ModelCard.tsx` (:80, :224, :226)
- `components/models/ModelCardDetails.tsx` (:105, :110)
- `components/models/HFModelSearch.tsx` (:190)
- `node_modules/react-native-marked/src/theme/styles.ts` (:76-135 default heading sizes)
