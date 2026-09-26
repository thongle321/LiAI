# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

One Expo / React Native product that genuinely adapts its design language per OS. iOS and
Android are both configured targets (`eas.json`, portrait, `supportsTablet`, camera and
microphone permissions, an iOS camera usage string), and the codebase already branches on
platform where it matters: keyboard avoidance behaviour, runtime safe-area insets, and
runtime-measured anchoring for overlays that fixed offsets could not position correctly on
notched phones.

## Users

**Primary: local-model hobbyists.** People who already run quantized models on their own
hardware. They know what a GGUF file and a quantisation are, they choose between models on
RAM tier and tokens-per-second, and they judge the output themselves rather than trusting a
benchmark.

- **Situation:** on their own phone, frequently on a poor or absent network, and unwilling to
  send prompts, keys, or documents to a server they do not control.
- **Job:** get a genuinely capable assistant running on their own hardware, pick the right
  model and quantisation for *this* device, and keep a conversation history that accumulates
  instead of resetting.

A general-consumer "everyday companion" framing has **not** been adopted. Onboarding, empty
states, and store copy should be written for someone who already understands what a model is,
not for someone being introduced to the idea. This is an open decision worth revisiting only if
the hobbyist audience is deliberately abandoned.

## Product Purpose

LiAI is a multimodal AI companion for mobile that runs its primary capabilities with no LiAI
server. Inference, tools, and search run on the device. Chat history lives in Supabase, reached
directly from the app under a silently provisioned anonymous identity, so a person never meets
a login screen and never needs an account to keep their history.

The product exists because a presentation client that cannot function without a backend is not
a companion — it is a thin window onto someone else's computer. This direction was a deliberate
reversal, recorded in ADR-0008, which retired the FastAPI backend that earlier architecture
rests on.

**Success means privacy credibility.** In six months, the signal is that people choose LiAI
specifically because nothing leaves the device, and that this is the reason they recommend it to
someone else. Not download counts, and not feature parity with anything.

## Positioning

**A companion that remembers.**

Memory and privacy are usually treated as competing goods: assistants that remember you need a
backend, and a backend means your data is not yours. LiAI's claim is that both hold at once,
because the memory store and the inference engine are separable and only the first one is
remote. A neighbour could add a chat history to a cloud assistant in a sprint; they could not
truthfully claim continuity without a server.

The mechanism that makes it stick:

- Conversation history, pins, rename, search-in-conversation, and per-model settings are
  durable product features, not conveniences.
- Identity is silent anonymous provisioning, so history exists on first run without an account.
  Row-level security scopes it per user, which means multi-device continuity is available later
  without a redesign.
- Inference, the agent loop, and its tools are on-device, so a session that depends on memory
  never depends on an inference server being reachable.
- The user supplies their own model and their own keys, so the assistant is genuinely theirs
  rather than a tenant.

Local inference by itself is *not* the differentiator — the on-device engine is a library
anyone can adopt. The combination of durable memory with no server dependency is.

## Operating Context

The hobbyist's loop, which is the sequence every surface has to support:

1. **First run.** Onboarding reads device RAM, proposes a tier, and offers a matching preset.
   No account, no login, no email gate.
2. **Acquiring a model.** Either download a preset from the bundled catalog filtered to the
   device tier, import a local GGUF from Files, or point the app at a remote OpenAI-compatible
   provider. Downloading and activating a model is a foreground, interruptible, resumable
   activity with visible progress and live transfer speed.
3. **Choosing a model.** One model slot is active at a time. Every model has its own settings
   (display name, system prompt, stop words) and its own inference parameters.
4. **Using it.** Text chat, voice, and vision. Within a turn, the agent may call tools.
5. **Keeping what mattered.** Sessions live in a drawer history that can be pinned, renamed,
   searched, and deleted. This is the part of the product that is doing the positioning work,
   and it is treated as a primary surface rather than a settings submenu.

One session is capped at the newest 100 turns. The client loads that full window when a session
opens; cursor paging would be vacuous against a cap this small.

Killing the app mid-stream must leave history intact — an interrupted turn is a recoverable
state, not a lost one.

## Capabilities and Constraints

**On-device inference (ADR-0011).** QVAC (`@qvac/sdk`, pinned 0.20.0) is the on-device engine,
exposed through a `CompletionEngine` seam supporting streaming text, tool calls, image
attachments, and cancellation. This replaced `llama.rn` outright — the dependency, Expo plugin,
wrapper, and tests were deleted, with no fallback retained. A one-slot lifecycle means exactly
one model is resident at a time; switching is a load, not a free assignment. Quality of
on-device output is variable and there is no tool-calling guarantee from every model, which is
accepted and must be communicated rather than hidden.

**Agent (ADR-0009).** An on-device agent loop detects tool calls in the stream, dispatches to
name-keyed engines, feeds results back under a turn budget of 5, and then forces a final
answer. Four talents ship: datetime, calculate, web_search, and read_url. HTML rendering is
explicitly deferred — it needs a WebView that is not an approved dependency.

**Persistence (ADR-0010).** Supabase is the sessions and messages store, accessed from the app
directly, keeping the `sessions`/`messages` shape including titles, pin state, turn metadata,
tool provenance, and token usage. Identity is anonymous sign-in at first run, persisted
on-device, upgradeable to email later. Row-level security is per user. There is no client
database; the app holds only the active session id and per-session drafts.

**Secrets (ADR-004).** Two tiers, and the distinction is architectural, not cosmetic. App-owned
keys never reach the client. User bring-your-own keys — a remote provider, a search provider,
a Hugging Face credential — are entered in the app, stored in `expo-secure-store`, and passed
per request. The Hugging Face token travels in a request header, never in a URL, because query
strings land in access logs. Nothing is stored in AsyncStorage or logged.

**Transport.** Streaming is server-sent events parsed over an XHR-based reader, because React
Native's `fetch` cannot stream a response body. Retry is only available on a streaming turn; a
non-streaming retry is rejected rather than silently mishandled.

**Scope boundaries, confirmed.** English only, with no language switcher. Light-locked, with no
theme switcher — the app presents one theme, and it is the light one. No login screen. Link
previews are limited to uncredentialed public pages, the single exception to the
route-all-external-access-through-the-server rule.

**Documentation drift, unresolved.** `docs/specs/2026-09-24-pocketpal-parity.md` is still marked
Draft and describes the retired backend architecture; it predates ADR-0008, ADR-0010, and
ADR-0011 and must not be treated as current. `AGENTS.md` and `app.json` still reference
`llama.rn`, which ADR-0011 deleted. These are open and unfixed.

## Brand Commitments

- **The name is LiAI.** App scheme `liai`.
- **The character is LiAI.** The anime portrait is binding identity, not reference art: she is
  the assistant's avatar, the face of the app, and the subject of the icon and empty states. A
  generic robot glyph is a brand-to-category substitution and is not acceptable. Any interface
  that would replace her with a neutral placeholder needs a new decision, not a default.
- **Tagline:** "A calm mind. A smarter everyday."
- **Voice:** calm, brief, and concrete. Short declarative headlines, plain instructions, one
  honest sentence about what went wrong instead of a stack trace. Three onboarding claims are
  the canonical product vocabulary and should be reused rather than re-invented: *See* —
  "Point. Ask. Learn." · *Chat* — "Talk it through." · *Voice* — "Tap to speak."
- Visual truth is defined in `DESIGN.md` and is deliberately not restated here. This record
  constrains what the product is, not how it looks.

## Evidence on Hand

**Assets that exist and are usable:**

- `prompt_material/minimal_design_system.png` — the adopted design system board.
- `prompt_material/chat_screen.png` — an earlier visual direction, retained for reference only.
- `assets/icon.png` — the app icon, referenced centrally through `constants/images.ts`.
- Seven architecture decision records under `docs/adr/`, accepted 2026-09-23 to 2026-09-25.
- `CONTEXT.md` — the ubiquitous-language glossary. The terms in it (Model, CompletionEngine,
  Provider, Ready to use, Available to download, Model Settings, Secret, BYOK, Session, Turn,
  Streaming, Talent, Agent run) are binding vocabulary.
- `AGENTS.md` — project engineering standards.

**Absences future work must not fabricate:**

- No users, no usage data, no metrics, no store listing, and no testimonials. The product is in
  development.
- No README, and no support, community, or press links.
- No pricing, licensing, or deployment claims of any kind.
- No competitive comparison that has not been measured.

Any copy that implies traction, a user count, a review score, or a peer-to-peer privacy
comparison is unsupported and must not be written until evidence exists.

## Product Principles

1. **The companion must outlive the session.** A conversation that cannot be found again is a
   demo. History, pins, rename, and search are the product; the model is an implementation of
   it.
2. **Nothing leaves the device that does not have to.** Every feature must justify a network
   call. The default answer is on-device, and a server round-trip is a decision that has to be
   defended, not a default.
3. **One live signal at a time.** A user should never have to wonder which of two things is
   current. This holds for interface state and for product truth: an accepted ADR supersedes
   the documents that predate it.
4. **Honesty over comfort.** Variable model quality, absent tool calling, a single model slot,
   and capped history are surfaced plainly rather than smoothed over. This is both an honesty
   rule and a trust strategy — credibility is the success metric.
5. **The user's model, the user's keys, the user's data.** Bring-your-own is the default shape
   of every model-related feature. The app is a tool the person operates, not a service they
   subscribe to.

## Accessibility & Inclusion

A confirmed product standard, adopted from the design system board and binding on every
surface:

- Text contrast of at least 4.5:1.
- Touch targets of at least 44×44dp.
- A minimum body text size of 16px, and no text below 12px anywhere.
- Colour is never the only indicator of state; every state carries a glyph and a word.
- Clear, visible focus states on every interactive element.
- Screen-reader labelling on icon-only controls, without exception.
- Support for dynamic type.
- Honour the system reduced-motion setting by collapsing animation durations to zero.

Dynamic type support is a real risk in a chat product: a fixed-height message row or composer
truncates the user's own text when they enlarge it. Layouts must grow with the type scale rather
than clipping it.
