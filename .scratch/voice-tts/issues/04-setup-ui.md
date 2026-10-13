# 04: Voice setup UI

**What to build:** Opening voice settings shows the spec's picker (Q15a):
a **System** group with a single "Device default voice" row, and a
**Kokoro** group rendered PocketPal-style — header with install/manage
affordance, ~20 curated named voices as radio rows, inline download button
with progress/error states, voice preview on tap (canned sentence, only
enabled once downloaded), and the auto-speak toggle row. The old OS-voice
list is gone.

**Blocked by:** 03 (engine-tagged voice + download states must exist).

**Status:** ready-for-agent

- [ ] The existing voice-settings route shows the two groups; the System group offers only "Device default voice" — no expo-speech voice enumeration anywhere (spec Q9/Q15).
- [ ] Kokoro group lists ~20 curated named voices; sid↔name order verified against the downloaded model (spec Q12, open item 2) and recorded in the spec.
- [ ] Before the model is downloaded: a download button with state/progress rendering from the store triplet; after: radio selection persists across restart.
- [ ] Tapping a (downloaded) voice row plays the preview sample through that engine; disabled while not installed (spec Q16 — same code/UI as PocketPal).
- [ ] Auto-speak row toggles `autoSpeakEnabled` (spec Q14).
- [ ] Visual/layout parity with PocketPal's voice picker structure, on the house styling rules (Uniwind classes, Lucide icons, BEM utilities).
- [ ] `npm run typecheck` + `npm test` green (UI state logic covered where node-testable).
