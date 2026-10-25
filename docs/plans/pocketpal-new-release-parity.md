# PocketPal v1.21.0 + HEAD — parity plan for LiAI

Source: vendored `pocketpal-ai/` checkout, HEAD `4a76784b` (after tag `v1.21.0`).
Scope: the non-translation commits landed between LiAI's last parity baseline and
pocketpal-ai HEAD. Translations/i18n are out of scope (LiAI has no i18n).

Each item below is a candidate. Mark the ones you want implemented; they can be
taken in the suggested order or independently. Sizes are from `git show --stat`.

## Status legend

- **NEW** — not in LiAI today; needs porting.
- **PARTIAL** — LiAI has a related surface; needs reconciliation.
- **DONE** — already in LiAI; verify parity only.

---

## 1. One Whisper model for dictation + voice mode (#1017) — DONE (2026-10-25, device verification pending)

Ported 2026-10-25. Spec: `docs/specs/2026-10-25-voice-unified-whisper.md`; research:
`docs/research/2026-10-25-pocketpal-one-whisper-parity.md`. Layout: voice mode drives
the Whisper capture harness (port of PocketPal's `useVoiceMode` + `CascadeVoiceEngine`
+ `Endpointer`) via `hooks/useVoiceMode.ts`; the OS-STT loop (`hooks/useVoiceLoop.ts`)
is deleted, and the old OS-STT helpers in `services/voice/voice-status.ts` serve only
`hooks/useVisionTurn.ts` now. Default tier is `base` (PocketPal ships `small`; LiAI
mobiles are the lower tier). Voice mode memory fit is arithmetic-only until a TTS
engine reports measured RAM (`ttsBytes: 0` → no tts row; `continueAnyway` stays
tight-only and is inert until then). New surfaces: `components/voice/mic-button.tsx`
(self-gating composer mic, opens the setup sheet in place instead of navigating),
`mic-setup-sheet.tsx`, `whisper-model-row.tsx`, `voice-setup-sheet.tsx` (no voice-picker
step — the session speaks whatever TTS settings hold), `voice-memory-sheet.tsx`;
`app/(drawer)/(tabs)/voice.tsx` is controller-driven; `components/voice/asr-setup.tsx`
tier rows switch through the store's public `selectTier` with the shared tier labels
(`utils/asr-tier-label.ts`).

Original state (pre-port):

Commit: `4a76784b` — 38 files, +1527/-365.

What pocketpal does: unifies dictation (composer mic) and hands-free voice mode
onto a SINGLE on-device Whisper model. Removes the OS speech-recognition path from
voice mode; voice mode now runs Whisper STT + VAD/segmenter like dictation. Adds
`MicButton`, `MicSetupSheet`, `WhisperModelRow`, reworks `VoiceSetupSheet`,
`SettingsScreen`, `ASRStore`, `useVoiceMode`, `MicButton`.

LiAI current state:
- Dictation already uses Whisper (`services/asr/*`, `hooks/useVoiceCapture.ts`,
  `components/chat/voice-recording-bar.tsx`, `store/asr.ts`).
- Voice mode (`hooks/useVoiceLoop.ts`) still uses OS STT via
  `expo-speech-recognition` (`ExpoSpeechRecognitionModule`), NOT Whisper.
- No `MicButton`/`MicSetupSheet`/`WhisperModelRow`/`VoiceSetupSheet` components;
  ASR rows live in `components/settings/voice-settings.tsx`.

Gap: voice mode is the last OS-STT consumer. Unifying means rewriting
`useVoiceLoop` to drive Whisper capture (VAD + segmenter + transcribe queue)
instead of the recognizer, and exposing a single selected Whisper tier that both
dictation and voice mode share.

Verdict: large. Highest value for LiAI's voice story but touches the core voice
loop and all voice UI. Recommend doing AFTER items 2–4, since it depends on the
ASR store being stable.

Files likely touched: `hooks/useVoiceLoop.ts` (rewrite), `store/asr.ts`,
`services/asr/*`, `components/chat/voice-recording-bar.tsx`,
`components/settings/voice-settings.tsx`, new `MicButton`/`MicSetupSheet`/
`WhisperModelRow` under `components/`, `app/(drawer)/voice.tsx`.

Risks: native Whisper availability in dev client (already verified for dictation);
voice-mode latency/UX regression; need device testing.

---

## 2. Phonon voice engine (#1009) — NEW

Commit: `b4e82f7c` — 48 files, +3444/-188. Native dep
`@pocketpalai/react-native-speech-phonon` (0.1.2) added to pocketpal.

What pocketpal does: adds "Phonon" as an on-device TTS engine (Kyutai/Pocket TTS
via Gradium, Apache-2.0) alongside the system TTS — fast startup, low memory,
English only. Adds engine picker in TTS settings, download/manage Phonon model,
memory gating, `VoiceSetupSheet`/`VoiceMemorySheet` changes.

LiAI current state: TTS is `expo-speech` only (`services/voice/voice-speak.ts`,
`services/tts/*`, `store/voice.ts`). No Phonon. `whisper.rn` is already in
deps; Phonon is a NEW native module not in LiAI's package.json.

Verdict: requires adding a native module + config plugin + dev-client rebuild.
High effort, device-gated. Recommend only if on-device TTS quality is a priority;
otherwise skip (expo-speech covers the use case).

Status (2026-10-25): IN PROGRESS (WIP, uncommitted). The author APPROVED the
native deps `@pocketpalai/react-native-speech` + `@pocketpalai/react-native-speech-phonon`
(recorded here per the Dependency Policy). The restructure in the working tree —
Phonon engine + the single-engines catalog replacing
`services/tts/engines/{kitten,kokoro,neural,supertonic}.ts`, `download.ts`,
`oneshot.ts`, and the streaming voice store — is deliberately left OUT of this
branch's item-1 commit and must not ship before it gets its own spec, restores
the deleted test coverage, and resolves the code-review findings recorded below
against it.

Files likely touched: `services/tts/*`, `store/voice.ts`, `components/VoiceSettings.tsx`,
`components/voice/*`, plus new native wiring in `plugins/`, `app.json`.

Risks: native module availability on Expo; iOS/Android build changes; memory
budgeting next to Whisper + chat model.

---

## 3. Run tool calls concurrently (#999) — DONE

Commit: `aad09f8a` — 18 files, +1807/-92.

What pocketpal does: in the agent runner, yield start events for ALL calls first,
dispatch them in one pass (max 4 at a time), then emit finish events in call
order; runner waits for all before ending. Adds runner-owned `AbortSignal` so
Stop cancels in-flight tools; opts into one-time 429 retry in search providers
(Retry-After / rate-limit reset header); shares one in-flight request between
identical searches.

Ported 2026-10-25: concurrency + call-order settle, runner-owned signal
threaded through `runTalent` → `searchWeb` / `readPage`, Stop and
conversation-abandon aborting the turn's tools, plus the full 429 / dedupe /
cancellation test matrix. LiAI's 429 retry and in-flight dedupe already existed
and were pinned, not rewritten. Details and deliberate divergences:
`docs/research/2026-10-25-pocketpal-concurrent-tools-parity.md`.

Files touched: `services/agent/runner.ts`, `services/agent/search.ts`,
`services/agent/registry.ts`, `store/chat/send.ts`, `store/chat/types.ts`,
`services/chat/turn.ts`, `services/agent/__tests__/*`,
`store/__tests__/chat-store.test.ts`, `services/chat/__tests__/local-turn.test.ts`.

---

## 4. Model stays unloaded after app switch (#1008) — PARTIAL

Commit: `171ccf4a` — 2 files, +533/-13.

What pocketpal does: fix app-state transition handling so a model auto-released
on background actually reloads on foreground; uses `pendingModelId` gating and
`contextOperationMutex` to avoid races; updates `appState` before branching.

LiAI current state: auto-release lives in `services/inference/auto-release.ts` +
`store/inference.ts` (`autoReleasedModelId`), with offload in
`hooks/useEngineOffload.ts`. Different shape than pocketpal's ModelStore, but the
same bug class (reload not firing on quick switch) is plausible.

Verdict: audit LiAI's reload path first; port the race-fix pattern
(`pendingModelId` + mutex gating) into `auto-release.ts` if the bug reproduces.
Small if reproducible.

Files likely touched: `services/inference/auto-release.ts`,
`services/inference/offload.ts`, `store/inference.ts`,
`hooks/useEngineOffload.ts`.

Risks: only worth doing if the crash/unload is reproducible on device.

---

## 5. Clamp effort to model-supported levels (#1002) — PORTED (2026-10-25, device verification pending)

Commit: `fac8f0e1` — 7 files, +252/-21.

What pocketpal does: a stored/new-chat effort (e.g. xhigh) can outlive the
model; clamp the resolved effort to the active model's `effortValues`, and
derive the pill grade from the active model.

LiAI current state: effort is a per-model radio in `components/models/model-settings-sheet.tsx`
backed by `store/inference.ts` `effortOverrides`. There is NO concept of a
model's supported effort levels (`effortValues`) and NO effort pill on the
composer. PocketPal's UI (pill) doesn't exist in LiAI by design (see
`utils/reasoning-capability.ts` header: "NO effort cycle on the pill").

Verdict: partially applicable. The defensive part (don't send an effort a model
can't grade) requires adding `effortValues` to model metadata, which LiAI
doesn't have. Low priority; skip unless effort mis-grading is observed.
If done: add `effortValues?: EffortLevel[]` to model type, clamp in
`resolveEffort`/`getEffort`.

Ported 2026-10-25: `resolveEffort(override, supported?)` now clamps (utils/reasoning-
capability.ts); `ModelSpec.effortValues?: EffortLevel[]` added (types/models.ts);
`defaultEffort` passes the active spec's levels (store/chat/index.ts). Composer
effort pill ported too (components/chat/message-input.tsx) — graded models cycle
off -> level0 -> ... -> off; effort-less models toggle on/off. Cycle set = declared
`effortValues` when present, else the full canonical set (turn clamps at send
time). No pill-grade "derivation" beyond the clamped value. Research note:
docs/research/2026-10-25-pocketpal-effort-clamp-parity.md. typecheck clean;
npm test 98 suites / 920 tests green (device verification pending).

Files likely touched: `types/*` (model), `utils/reasoning-capability.ts`,
`store/inference.ts`, `services/chat/turn.ts`.

---

## 6. You.com search provider (#986) — DONE

Commit: `f180d1d5` — 18 files, +443/-23.

LiAI already implements You.com: `services/agent/search.ts` (`youSearch`),
`services/search/search-providers.ts` (`you` id, `requiresKey: false`),
`store/search.ts`, `components/settings/search-settings.tsx`. Default provider
is Brave (PocketParity).

Verdict: DONE. Only verify parity of the 429-retry behavior from #999 (item 3)
and malformed-envelope handling (already covered by #962 audit). No new work.

---

## 7. Hands-free voice mode in chat (#1007) — PARTIAL (covered by #1017)

Commit: `bf59697d` — 140 files, +10043/-347. Very large.

LiAI has its own hands-free implementation (`hooks/useVoiceLoop.ts` with
auto-restart, End control, silence finalize, anti-hallucination prompt). This is
the same feature area as #1017 (item 1). Recommend folding #1007's UX details
into the #1017 port rather than porting separately.

Verdict: fold into item 1; do not do as a standalone pass.

---

## 8. PocketPal Plus (#1004) + Plus copy (#1015) — SKIP (out of scope)

Monetization/Plus screen. LiAI has no IAP/Plus surface. Skip unless product
decides to add monetization.

---

## 9. React Native 0.82 → 0.87 upgrade (#993) — SKIP

LiAI is on Expo SDK (managed); RN version is owned by Expo. Do not upgrade
outside an Expo SDK bump.

---

## Recommended order

1. **Item 3** (concurrent tool calls) — self-contained, clear win, tests exist.
2. **Item 4** (app-switch unload) — only if reproducible; otherwise skip.
3. **Item 5** (effort clamp) — low value; defer.
4. **Item 1** (#1017 unification) — biggest; do last, after ASR store is stable.
5. **Item 2** (Phonon) — device-gated; schedule with a dev-client rebuild.
6. **Items 6–9** — no work (done/skip/fold).

## How to proceed

Tell me which item numbers to implement (e.g. "3 then 1") and I'll start with
the first, running `/tdd` per slice and `/code-review` at the end. Each item
should get its own research note under `docs/research/` and, if multi-session,
a spec under `docs/specs/` before coding (per AGENTS.md parity rules).
