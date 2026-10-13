# 02: sherpa-onnx install + kokoro tracer bullet (download bridge)

**What to build:** The app builds and runs with `react-native-sherpa-onnx`
installed, downloads the English kokoro model through the library's
built-in download manager, and speaks a canned sentence through the neural
engine on a real Android device. The one-shot download code is shaped into
the reusable bridge the later tickets need: manager progress maps onto the
`not_installed / downloading / ready / error` state machine with percent.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Deps installed as one unit: `react-native-sherpa-onnx` + peers `@dr.pogodin/react-native-fs`, `@kesha-antonov/react-native-background-downloader` (spec Q6 — approved).
- [ ] Dev-client build succeeds against the committed `android/` (Gradle fetches native libs at build time — needs network).
- [ ] English kokoro model fetched via `refreshModelsByCategory` / `downloadModelByCategory` with visible progress; local path handed to `createTTS` (spec Q4/Q8).
- [ ] `generateSpeech` output audible on device via the library's PCM player.
- [ ] Download logic exported as a reusable bridge producing state-machine transitions + percent for the store (ticket 03 consumes it).
- [ ] Spec open items 1–3 resolved with evidence and recorded back in `docs/specs/2026-10-13-voice-tts-parity.md`: exact registry model ID + size, whether the batch engine exposes the PCM player (or the streaming-engine fallback is used), and a first pass at speaker count.
- [ ] `npm run typecheck` and `npm test` green (device proof is a manual checkbox — native playback has no node coverage).
