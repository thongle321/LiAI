# Spec: Voice feature (TTS) — PocketPal parity on sherpa-onnx

The authoritative spec is **`docs/specs/2026-10-13-voice-tts-parity.md`**
(read it before starting any ticket here).

Tickets in `issues/` implement it. Two quiz-time amendments on top of the
spec:

1. The setup UI stays the existing **route** (`voice-settings`), not the
   global sheet the spec assumed — same contents, less churn.
2. The existing OS-voice picker is **removed** (spec Q9/Q15); persisted
   `voiceId`s migrate to "Device default voice" in ticket 03.
