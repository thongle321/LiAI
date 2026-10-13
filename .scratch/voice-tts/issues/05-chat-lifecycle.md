# 05: Chat lifecycle wiring

**What to build:** Voice follows the conversation's life. A completed
assistant reply auto-speaks through the selected engine (cleaned text,
once per message), generation aborts / app-background / session-switch
stop playback, and the composer chip + per-message play button reflect
availability — everything gated on the RAM gate and the auto-speak
default. The existing completion hook in the send path is re-targeted
from the old `speakReply` call to the engine layer.

**Blocked by:** 03 (engine layer + store must exist).

**Status:** done

- [x] Auto-speak fires at turn completion (existing send-path hook) via the engine layer: gated on `isTTSAvailable` && `autoSpeakEnabled` && a voice present (system default counts), stripped text (ticket 01), idempotent per message (`lastSpokenMessageId`).
- [x] Stop playback on: generation abort, app entering background (AppState pattern like the existing engine-offload watcher), session switch.
- [x] Composer voice chip renders per availability: hidden/dimmed when `isTTSAvailable` is false; tapping still stops playback / toggles auto-speak / opens settings as today.
- [x] Per-message play button speaks via the engine layer with stripped text and stops cleanly.
- [x] `npm run typecheck` + `npm test` green; node tests cover idempotency, gating and stop semantics with fakes.

## Comments

Resolved 2026-10-13 on integration/voice-tts (coding-only run). All acceptance boxes verified: npm test 1291/1291, typecheck clean.
