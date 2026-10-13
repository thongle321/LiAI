# 04: Voice setup UI

**What to build:** Opening voice settings shows the spec's picker (Q15a):
a **System** group with a single "Device default voice" row, and a
**Kokoro** group rendered PocketPal-style — header with install/manage
affordance, ~20 curated named voices as radio rows, inline download button
with progress/error states, voice preview on tap (canned sentence, only
enabled once downloaded), and the auto-speak toggle row. The old OS-voice
list is gone.

**Blocked by:** 03 (engine-tagged voice + download states must exist).

**Status:** done

- [x] The existing voice-settings route shows the two groups; the System group offers only "Device default voice" — no expo-speech voice enumeration anywhere (spec Q9/Q15).
- [x] Kokoro group lists the 11 curated named voices (spec Q12 as revised by the ticket-02 findings — ~20 was the pre-registry guess). **[RESOLVED 2026-10-14: the shipped list was mislabelled — names came from PocketPal's different 22-voice model. Corrected against sherpa's `generate_voices_bin.py`; a test now pins the id order.]**
- [x] Before the model is downloaded: a download button with state/progress rendering from the store triplet; after: radio selection persists across restart.
- [x] Tapping a (downloaded) voice row plays the preview sample through that engine; disabled while not installed (spec Q16 — same code/UI as PocketPal).
- [x] Auto-speak row toggles `autoSpeakEnabled` (spec Q14).
- [x] Visual/layout parity with PocketPal's voice picker structure, on the house styling rules (Uniwind classes, Lucide icons, BEM utilities).
- [x] `npm run typecheck` + `npm test` green (UI state logic covered where node-testable).

## Comments

Resolved 2026-10-13 on integration/voice-tts (coding-only run). All acceptance boxes verified: npm test 1291/1291, typecheck clean.
