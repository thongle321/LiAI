# PocketPal commits 2026-10-11 to now — parity notes

Source: GitHub REST `a-ghorbani/pocketpal-ai` commits with `since=2026-10-11T00:00:00Z`; 2 pages, page 2 empty (6 commits total). One commit (`ac1e31c`) is a weblate-translations merge and is skipped.

## Commits

### 1) 62d004d9 — `[Feat]: Scan a QR code to fill the add-server URL (#978)` (2026-10-14)
- Files (key): new `ServerQRScanner` component, `RemoteModelSheet.tsx`, vision-camera `useCodeScanner`, `normalizeUrl` http helper, tests.
- Verdict: **PARTIAL / ADAPT opportunity**. LiAI already has remote-model flow + VisionCamera is in stack. Target to adapt: `components/models/RemoteModelSheet.tsx` + camera permission UX. Need native vision-camera code-scanner API verification on device.
- Risk: native scanning API could differ; permission flow on Android vs iOS.

### 2) 7b809ef8 — `[Bug]: Auto-speak reads tool-call echoes, drops start of later steps (#976)` (2026-10-14)
- Files: `useChatSession` TTS step logic tests; touches `derivedText` / chat util.
- Verdict: **ADAPT (if TTS parity sought)**. LiAI has tool-calling (`lib/agent/runner.ts`, `lib/chat/turn.ts`, `types/chat.ts` `AgentStep`) and TTS (`lib/tts/*`, `store/voice.ts`, `components/VoiceSettings.tsx`). Target: `lib/chat/turn.ts` + TTS hooks in `lib/tts/runtime.ts`; verify chunk streaming so TTS skips tool-call echoes and speaks first chars. Consult `docs/specs/2026-10-13-voice-tts-parity.md`.

### 3) 5229add4 — `[Bug]: Fix crash when a model is released during a completion (#955)` (2026-10-13)
- Files: huge; ModelStore generation lease, Chat send lease, llama.rn fork patches (context ownership, abort callback), tests. (full commit detail partial due size)
- Verdict: **SKIP on the native llama.rn fork patch (LiAI uses standard `llama.rn`). PARTIAL on the JS lease.** Target only if crash reproducible: add generation lease in `store/models/active.ts` + `lib/chat/turn.ts`. Otherwise skip. Risk: native pitch-point markers required — not feasible without fork.

### 4) a4d4fda7 — `[Bug]: Search providers report malformed responses as errors (#962)` (2026-10-13)
- Files: search provider clients throw on malformed envelopes (Tavily / Exa / Parallel / Brave / Firecrawl / Exa page reads).
- Verdict: **ADAPT if applicable**. LiAI has web_search talent (`lib/agent/registry.ts`, ...). Check whether LiAI implements these remote search providers. Target: `lib/agent/registry.ts` + search provider module — add malformed-envelope validation + tests. If LiAI uses only one provider, scope to that.

### 5) ac1e31cb — weblate-translations merge — SKIP (i18n out of scope for LiAI core at this pass)

## LiAI surface reference (what we already have / lack)

- chat / voice: `app/(drawer)/(tabs)/chat.tsx`, `voice.tsx`; `app/(drawer)/voice-settings.tsx`
- voice comp: `components/VoiceSettings.tsx`, `components/voice/*`; `store/voice.ts`
- TTS: `lib/tts/*`
- models: `lib/models/*`, `store/models/*`
- remote scanner target: `components/models/RemoteModelSheet.tsx`
- agent: `lib/agent/runner.ts`, `lib/chat/turn.ts`, `types/chat.ts`
- specs: `docs/specs/2026-10-*.md`

## Suggested order of work

1. Search-provider malformed-response hardening — small, testable → `lib/agent/registry.ts`.
2. TTS echo-skip parity — only if the voice spec is active → `lib/tts/runtime.ts` + `lib/chat/turn.ts`.
3. QR scan in RemoteModelSheet — device-gated → `components/models/RemoteModelSheet.tsx`.
4. Release-during-completion — defer until a crash is reproduced; depends on native fork.

## LiAI gaps vs PocketPal features

- No internet-search consumer inside chat today → skip item 4 until a search feature is added.
- No auto-speak per chat-step TTS today → skip item 2 until TTS parity is complete (still in flight per spec).
- No generation lease today → skip item 3 unless a crash is hit.
- QR scan would land smoothly on existing VisionCamera surface — highest-value surviving port.

## Limitations

Only commit messages and file-name/subject clues were reviewed. Per-commit diffs must be read with `git show <sha>` on a freshly cloned pocketpal repo (local checkout is frozen at 2026-08-25) before implementing. No line counts or full file lists are asserted here.
