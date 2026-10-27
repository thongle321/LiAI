# Voice-tab hands-free parity — finishing the PocketPal port in-tab

Date: 2026-10-27. Reference: pocketpal commit `bf59697d` (#1007, 140 files),
researched in `docs/research/2026-10-27-pocketpal-hands-free-chat-parity.md`.
Supersedes that doc's "Diff: what this port adds" table.

## Decision this spec records

The research doc proposed porting PocketPal's in-chat UX layer: a composer
button replacing Send, a full-screen overlay over the chat, and a collapse
bar riding in the composer's place. **Rejected** (product decision): LiAI's
voice is its own tab (`app/(drawer)/(tabs)/voice.tsx`), not a chat overlay.
None of the three chat-embedded items is planned; the dormant plumbing that
anticipated them (`presentation` in the circuit, origin-anchored blur guards)
stays as-is — the presentation field in particular becomes live here, rendered
inside the Voice tab rather than over chat.

The hands-free ENGINE is already ported (#1017, spec
`docs/specs/2026-10-25-voice-unified-whisper.md`): phase machine, endpointer,
cascade engine, mic watchdog, keep-awake, entry gates, memory sheet,
auto-relisten, tap-to-interrupt. This spec covers the four remaining parity
items, all inside the Voice tab.

## 1. Per-turn `speech_failed` outcome + hint

PocketPal resolves a turn as `speech_failed` when the chain completed but the
reply never played as audio (its per-turn stream-failure bookkeeping), surfaced
as the hint "Couldn't play the answer aloud." LiAI has no per-turn speech
bookkeeping (recorded #1017 divergence), so the observable equivalent: the
cascade engine already tracks whether any playback was observed during the
turn (`watchSpeech` in cascade-engine.ts). A turn whose send succeeded, was NOT
interrupted, and heard no speech → outcome `speech_failed`.

- `services/voice/types.ts`: `speech_failed` joins `VoiceTurnOutcome`.
- `services/voice/cascade-engine.ts`: return it when `speech.stopped()` is
  false on the happy path.
- `hooks/useVoiceMode.ts`: `FAILURES.speech_failed = "Couldn't play the
  answer aloud."` (reference l10n `errorSpeech`, verbatim).

## 2. Mic mute (mid-session)

Reference: `toggleMute()` — flip `micMuted`, then (listening only) muted stops
the capture, unmuted restarts it with a fresh watchdog retry budget; muting
never ends the session and never touches a running turn. `isListening` also
requires `!micMuted`, so an auto-relisten restart while muted is a no-op until
unmute. UI: a round mute button (Microphone/MicrophoneOff icons) in the full
view's reserved slot; the orb shows the frozen greyed treatment
(`paused` + a muted color); the status line reads "Microphone off / Tap the
microphone to talk again" while muted (interpretation recorded: the override
lands on the muted LISTEN only, exactly like the reference's
`voiceVisual(phase, micMuted)` — a muted mid-turn keeps Thinking/Speaking
until the next listen goes live).

## 3. Audio-interruption pause/resume

Reference: a phone call, alarm or Siri takes the audio session
(`onAudioInterruption` from `@pocketpalai/react-native-speech`).
`began` → stop the mic, interrupt any turn, and flag `pausedByInterruption`
(controller-internal; the UI side reuses `micMuted=true`) — the watchdog is
off because the capture is off and `ended` may never arrive (Android holds
focus only while a chunk plays; iOS can skip it after Siri).
`ended` (or a cloud tap, or the app returning to active) → resume unmuted:
fresh mic start, `micMuted=false`. Backgrounding still exits. The subscription
lives in the host hook and tears down with it. Recorded reference-parity
addition: an `inactive → active` foreground of an UN-paused live listen
restarts the capture (`mic.restart why: foreground`, reference
useVoiceMode — iOS lays the recorder down with the audio session).

## 4. Collapse full/bar, rendered in-tab

Reference thresholds, verbatim: pull down ≥80 pt or flick ≥800 pt/s collapses
the full view; the bar re-expands on tap or swipe up ≥40 pt (flick ≥800 pt/s,
lift capped 120 pt); Android back also collapses. The session, mic and turns
keep running across the swap.

In-tab divergences (recorded):
- PocketPal drags the WHOLE overlay; LiAI's full view scrolls, so the pull-down
  gesture (plus the tap) lands on the reserved drag-handle row only.
- PocketPal's bar sits where the composer was, over the chat; LiAI's bar is
  pinned at the bottom of the Voice tab itself (mini orb 56, status title,
  mute + End), with the same swipe-up/tap expand.

## Non-goals

- Composer `VoiceModeButton`, overlay-over-chat, `spoken: true` metadata,
  Plus gate/device gate/Settings toggle — chat-embedded or deliberate
  divergences already recorded in the #1017 spec.
- No store-schema change: `pausedByInterruption` stays controller-internal;
  the UI pause state rides the existing `micMuted` flag, both as PocketPal.

## Tests

Controller suite: mute edges (mute during listening stops capture; unmute
restarts; muted blocks the auto-relisten restart; mute during a turn leaves
capture alone until the next listen), interruption (began → capture stopped +
turn interrupted + mic shown off; ended/tap/foreground → resume unmuted),
speech_failed issues the hint. Store suite: nothing new (no schema change).
Full view: mute button + muted status, collapse gesture thresholds off the
handle row, Android back. New bar suite: tap/swipe expands, mute + End wired.
