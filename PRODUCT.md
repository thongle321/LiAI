# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

**Self-hosting enthusiasts.** People who already think of a model as something you
download and run, not something a company rents you. They open LiAI to chat, to
show the camera something, or to talk, and they expect the model to be running on
the phone in front of them — a GGUF they chose, on hardware they own. Being
technically literate is the norm, so the product may assume that reading a
quantization name or a context size is not a barrier.

They are not the audience for a turnkey consumer assistant: this user *wants* the
model catalogue and the tuning knobs.

## Product Purpose

LiAI is a multimodal AI companion that runs its inference **on the user's own
phone**. Text chat, voice input and output, and camera vision are served by a
GGUF the user downloads and the app loads locally through `llama.rn`; the network
is used to *acquire* models, not to think with them.

Success means: a user downloads a model, the app works in airplane mode from that
point on, and nothing they say or photograph leaves the device. A remote API
provider can be connected for users who want one, but it is a supplement — the
local model is the product, not a fallback for when the network is up.

## Positioning

**Local-first: the model runs on the device, so the product works offline and
nothing the user says or sees is sent anywhere.**

A neighbouring app could claim privacy, but only by doing nothing useful with the
camera or the microphone. LiAI is multimodal *and* local: the same voice and
vision work with the network off. The one network dependency after install is
model acquisition, including a user-supplied Hugging Face token for gated
repositories — a key the user pastes in themselves, held in the device keystore,
never ours.

## Operating Context

- One-handed, portrait phone use; the conversational surfaces (chat, voice) are
  the ones used repeatedly, the model catalogue is used occasionally.
- Model downloads are multi-gigabyte, slow and interruptible. Transfers continue
  through a native background downloader and are adopted back into the UI after a
  process death; partial files resume rather than restart.
- The loaded model is released when the app is backgrounded, so a multi-GB GGUF
  is not held resident.
- Device capability is not uniform. Model sizes are chosen against a per-device
  tier, and a model that will not fit is refused with a stated reason rather than
  attempted.
- The user may be offline, in poor signal, or out of storage at the moment they
  tap Download; each is a normal state with its own message.

## Capabilities and Constraints

Confirmed functionality (this is the shipped surface, not a roadmap):

- **Local inference** — GGUF models through `llama.rn`, including a curated preset
  catalogue and Hugging Face search and download.
- **Text chat** — streaming responses, per-conversation generation settings,
  persisted sessions.
- **Voice** — speech recognition for input, speech synthesis for output.
- **Vision** — camera capture answered by the model, including a vision model's
  projector ("mmproj") fetched as a second leg of its download.
- **Reasoning** — per-model thinking control and graded effort levels, where the
  model supports them.
- **Per-model settings** — name, BOS/EOS tokens, generation prompt, system prompt,
  chat template, stop words, projection model.
- **Remote providers** — OpenAI-compatible endpoints as a supplement to local
  models, with a user-supplied API key.

Technical constraints:

- **Portrait only**; `android/` is committed rather than regenerated, so native
  edits survive but prebuild must not be run clean.
- **arm64-v8a only** in the Android build config.
- **Camera-less devices must stay installable** (the two `uses-feature` lines in
  the manifest).
- **Secrets never leave SecureStore** — the Hugging Face token and provider keys
  are not written to AsyncStorage and not present in `lib/`.
- **Ask before adding a dependency.** No new major library without a stated
  reason and explicit approval.

Explicitly undecided: distribution channel and release process; whether a hosted
or sync backend ever exists.

## Brand Commitments

- **Name:** LiAI. Bundle id `com.anonymous.liai`, scheme `liai`.
- **Tagline:** "A calm mind. A smarter everyday."
- **Voice:** plain, unhurried, non-technical where it can be. Permission prompts
  are written as sentences that say what the feature is for — "LiAI needs the
  camera to see what you see.", "LiAI needs the microphone to hear your
  questions." — never as legal boilerplate.
- **Three pillars**, stated in onboarding and carried by the tab bar: **See**
  (point, ask, learn), **Chat** (talk it through), **Voice** (tap to speak).
- **First-run shape:** onboarding runs once, on a real decision (pick a model),
  then the user lands in chat.

## Evidence on Hand

- **No testimonials, user counts, benchmarks, pricing, or press.** None exist,
  and none may be invented.
- **Assets:** `assets/icon.png`, adaptive icon set (foreground, background,
  monochrome), `splash-icon.png`, `favicon.png`. There is **no photography and no
  illustration** in the product today.
- **The design board** the visual system derives from: `prompt_material/`
  (see `DESIGN.md` for how each token was derived and measured).
- **`pocketpal-ai/`** — a vendored reference application, read-only, used as the
  measured behavioural and anatomical reference for parity work. It is not this
  product and must never be edited.
- **Specs and research:** `docs/specs/` (per-feature specs and audits),
  `docs/research/` (reference-behaviour findings, recorded divergences).
- **Executable parity checks:** `npm test` runs the Jest suite (`jest/` plus every `__tests__/`
  beside its subject), and pins the anatomy and copy of the surfaces measured against the reference.

## Product Principles

1. **The device is the server.** If a feature cannot work in airplane mode, it is
   an acquisition feature (downloading, searching, authenticating) — and it must
   say so in its copy.
2. **Never claim what is not built.** No benchmark, no user count, no privacy
   promise that a code path does not honour. When LiAI diverges from the
   reference, the divergence is *recorded* with its cost, not hidden.
3. **Ask, then add.** A new dependency is a decision with a stated reason, not a
   convenience. The smallest version that does the job ships first.
4. **Secrets stay on the device.** Keys the user pastes are held in the platform
   keystore and never travel through app state, logs, or AsyncStorage.
5. **Respect the hardware.** Refuse a download that will not fit, say why, and
   resume rather than restart. The phone is the budget, not the user's patience.

## Accessibility & Inclusion

Binding requirements:

- Touch targets clear **48×48dp** on both platforms (Android's Material minimum
  is the higher bar and is the shared one), held in the BEM blocks in
  `global.css` rather than at call sites.
- Text contrast **4.5:1**, non-text marks **3:1**, measured against real token
  values in `jest/design-system.test.ts`; a token drifting from its CSS mirror in
  `themes/tokens.ts` fails `npm test`.
- **Dynamic type** is supported: the type scale drifts with device width inside a
  clamped range and composes with the system accessibility scale.
- **Colour is never the only signal** — every status carries a glyph and a word.
  The one recorded exception is the bottom tab bar's active state.
- Reading text never renders below 14px; smaller rungs label metadata only.
