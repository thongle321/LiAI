# 03: Engine layer + voice store migration

**What to build:** One store API can speak through either engine. A
PocketPal-shaped engine abstraction (`Engine` interface, static registry,
single-slot runtime with a FIFO mutex — only one native model loaded at
a time) sits behind the voice store: the System engine wraps the existing
expo-speech path, the Kokoro engine wraps sherpa. The store gains the
spec's state (current voice with engine tag, playback state machine,
download-state triplet, availability gate) and migrates the old persisted
system-voice selection to "Device default voice".

**Blocked by:** 02 (the Kokoro engine needs the proven sherpa API + download bridge).

**Status:** done

- [x] Engine interface + registry with two engines: system (expo-speech) and kokoro (sherpa), per spec Q2 — kitten/supertonic NOT included (phase 2).
- [x] Single-slot runtime: switching engines releases the previous slot before loading the next; a stop() queues correctly against an in-flight acquire.
- [x] Store exposes: `currentVoice` (engine-tagged), `playbackState` (`idle/playing` + messageId), per-engine `DownloadState/Progress/Error`, `isTTSAvailable` = trististate override ?? (total memory ≥ 4 GB) (spec Q14/Q5).
- [x] Old persisted `liai_voice_v2` voiceId (an OS voice) migrates to a "Device default voice" system row; nothing references removed OS-voice identity afterwards (quiz Q-B.2).
- [x] Auto-speak default remains OFF; prefs persist across restart.
- [x] Download bridge from ticket 02 feeds the download-state triplet.
- [x] `node --test` covers the state machine, migration, and runtime queuing with fakes; `npm run typecheck` + `npm test` green.

## Comments

Resolved 2026-10-13 on integration/voice-tts (coding-only run). All acceptance boxes verified: npm test 1291/1291, typecheck clean.
