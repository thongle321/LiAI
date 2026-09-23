# Spec: PocketPal feature parity for LiAI (minus pals)

Date: 2026-09-24
Status: Draft — awaiting sign-off
Decisions: ADR-003, ADR-004, ADR-005, ADR-006, ADR-007

## 1. Goal

Port PocketPal's non-pal feature set onto LiAI's split architecture:
everything that is AI execution or external API access lives in `backend/`
(Python/FastAPI); the app is a presentation + device-integration client.
Frontend concepts are ported, not libraries (Zustand/Uniwind/Expo Router).

## 2. Scope

| PocketPal feature | LiAI home | Wave |
|---|---|---|
| Multi-session chat, streaming, markdown/code, reasoning+tool surfaces | `modules/chat` (SSE) + `components/chat` | 1 |
| Session mgmt, copy/regenerate, prompts, usage, export, search-in-chat | FE chat + BE sessions | 1, 5 |
| Agent runner + talents (datetime, calculate, web_search, read_url) | `modules/companion` + `modules/search` | 2 |
| Web-search providers (Tavily, Brave) + budget/cache | `modules/search` | 2 |
| Model catalog: presets, device-tier display, downloads, local import | FE `components/models` (done) + BE HF proxy | 3 |
| HuggingFace search/files | `modules/models/internal/hf.py` proxy | 3 |
| GGUF runtime (activate → backend serves) | `providers/llamacpp.py` | 3 |
| In-chat image attach; real-time vision | FE composer; `modules/vision` unchanged | 4 |
| TTS: system voices + settings UX | FE only (`expo-speech`) | 4 |
| Onboarding (trimmed) | `app/onboarding` + `components/onboarding` | 5 |
| Remote providers (OpenRouter/custom, BYOK) | FE `store/models/remote` + BE per-request creds | 1–3 |

**Explicitly out of scope:** all pals*, benchmark, devtools, checkout, feedback,
hub-run deep links; on-device inference machinery (llama.rn contexts, draft/MTP,
mmproj/projection pairing, GPU/thread/context knobs, RAM calibration, native
download module, ONNX TTS); `render_html` talent (deferred — needs a WebView);
theme switcher (dark-locked); language switcher (English-only).

## 3. Frontend directory (target)

Folders materialize when their first file lands (AGENTS: "do not create
components too early"). `components/models/` is done.

```
app/                          # thin routes only
  (drawer)/(tabs)/chat.tsx    # <ChatScreen/>
  vision.tsx  models.tsx  settings.tsx  about.tsx
  onboarding/                 # trimmed flow (wave 5)

components/
  chat/       ChatScreen, MessageList, Bubble (moved), MarkdownView,
              CodeBlock, ChatInput (moved from InteractionPanel),
              SessionList, MessageActions, SuggestedPrompts, UsageStats,
              ImageAttach
  models/     (done)
  vision/     VisionOverlays (moved)
  settings/   SettingRows, VoiceSettings, SearchSettings (moved)
  onboarding/ step components (wave 5)
  (root)      ScreenHeader, AppDrawer, BottomNav, Unavailable  # shared

store/
  chat/       index.ts (composed), sessions.ts, send.ts
  models/     (done)
  voice.ts  search.ts  ui.ts

lib/
  chat/       sse.ts (XHR SSE parser), api.ts (history/sessions client),
              messages.ts (mapping + markdown helpers)
  models/     huggingface.ts, remote-api.ts (done)
  search/     provider metadata for the settings UI
  vision/     socket.ts, snapshot.ts (moved)
  (root)      voice*, motion, load-guard, secrets, ...

hooks/        useVoiceLoop, useVisionTurn, ...  # no useChatStream:
          streaming lives in store/chat + lib/chat (store-direct)
types/        chat.ts (new), models.ts, api.ts
constants/    images.ts when onboarding illustrations land
```

## 4. Backend directory (target)

Keeps ADR-002 module rules (public `__init__`, private `internal/`).

```
backend/app/
  modules/
    chat/
      router.py        POST /api/chat  (stream flag → SSE or JSON)
      service.py       stream orchestration + persistence
      schemas.py       ChatRequest (+model_id, byok, image, retry), events
      internal/sse.py  event framing (pure)
    companion/
      agent.py         loop: stream → dispatch talent → feed back (max turns)
      internal/tools/
        datetime.py  calculate.py  web_search.py  read_url.py
        untrusted.py           prompt-injection wrapper (pure)
    search/                    NEW module
      __init__.py            public: search_web(provider, key, query, count)
      providers/{base,tavily,brave}.py
      budget.py              result clipping + LRU cache (pure)
    vision/                  unchanged
    models/
      internal/hf.py         HF search + file-listing proxy
  providers/
    factory.py               resolve(model_id, byok) → provider
    llamacpp.py              NEW: serves the active GGUF (plain chat, one slot)
    openrouter.py            unchanged (app-owned key from env)
```

### Contract changes

- `POST /api/chat` — body adds `image?`
  (exists), `retry?` (drops the last assistant turn), `stream?`.
  (`model_id?`/`byok?` arrive with the Wave-3 provider resolution.)
  `stream:false` → existing JSON contract (voice/vision paths unchanged).
  `stream:true` → `text/event-stream` events:
  `token {text}` · `tool {name}` (Wave 1; status/input/result arrive with
  the Wave-2 agent loop) · `usage {…}` · `done {session_id}` (Turns carry
  no message ids, so there is no message_id) · `error {code,message}`.
  `retry:true` requires `stream:true` (JSON+retry → 422): the non-stream
  turn persists user+assistant together, so a JSON retry could not avoid
  duplicating the question.
- `GET/POST/PATCH/DELETE /api/sessions…` — list, create, rename/pin,
  delete. `GET /api/history` is unchanged: both stores cap a session at
  the newest 100 turns, so the client loads the full window per open
  (the actual lazy-load) and cursor paging would be vacuous.
- `GET /api/models/hf/search?q=&token=` and `/api/models/hf/files?repo=&token=`
  — HF proxy; token passed per request, never stored or logged.

### Chat data flow (streaming)

```text
Composer → store/chat.send() → XHR POST /api/chat {stream:true, model_id, byok?}}
  → BE: session → agent/provider stream → SSE events →
FE: sse.ts parser → store updates (token appends, tool steps, usage) →
    Bubble renders MarkdownView; done → message finalized + persisted.
```

Transport: XHR-based SSE parser (RN `fetch` cannot stream bodies) — no new dep,
PocketPal's approach. Sessions/messages live only in Supabase; the client keeps
the active session id in AsyncStorage (ADR-001: no local DB). Per-session
composer drafts ride Wave 5 polish (with export/search), not Wave 1.

## 5. Dependencies (approved this session)

**Frontend (all JS, no dev-client rebuild):**
`react-native-marked` (bundles `marked`; renders tokens natively; custom
renderer plugs in highlighting) · `react-native-code-highlighter` (the
same-author bridge PocketPal's code renderer uses; pulls in
`react-syntax-highlighter` + `@types`) ·
`link-preview-js` via its `./mobile` export (Node-free; fetches uncredentialed
public pages only — the single ADR-004 exception) · `expo-clipboard`
(first-party Expo, message copy in bubbles and code blocks).

Rejected: `marked` + `@native-html/render` as a second pipeline next to
`react-native-marked` (dead weight — nothing consumes the HTML renderer).

**Backend:** `trafilatura` (read_url extraction). Link previews need no
backend support.

**Rejected/avoided:** `@kesha-antonov/react-native-chat` (evaluated — brings
`react-native-keyboard-controller` native dep + parallel `IMessage` model;
custom UI kept), `llama.rn`, MobX, `react-native-paper`, WatermelonDB, ONNX TTS.

## 6. Waves

1. **Chat core** — BE sessions CRUD + SSE streaming + usage + steps; FE
   `store/chat` slices, sse parser, MarkdownView/CodeBlock, streaming Bubble,
   session list in the drawer, copy/regenerate. Kill-app mid-stream must leave
   history intact.
2. **Tools + search** — search module (tavily/brave, budget+cache), agent loop,
   4 talents, untrusted wrapper; FE tool chips, BYOK search keys per request.
3. **Models runtime** — LlamaCppChatProvider + `resolve(model_id, byok)`, HF
   proxy; FE HF browser via proxy, activation runs the GGUF server-side.
4. **Vision in chat + TTS UX** — image attach (camera/gallery) via existing
   backend image path; link previews via proxy; voice-picker settings.
5. **Onboarding + polish** — trimmed flow, device-tier preset display, export,
   in-chat search, usage stats UI.

## 7. Risks

- **GGUF serving**: llama-cpp-python with arbitrary user GGUFs — variable
  quality, no tool calling, one model slot, memory pressure next to the VLM.
  Mitigation: plain chat only, lazy load, single slot, documented limits.
- `react-syntax-highlighter` bundle weight — swap to a light build if it bites.
- `react-native-marked` treats raw HTML in model output as plain text (its
  documented behavior) — acceptable for LLM output; revisit only if a model
  emits HTML that must render.
